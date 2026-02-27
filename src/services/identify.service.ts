import { prisma, type PrismaTransactionalClient } from "../lib/prisma.js";
import { LinkPrecedence, type Contact } from "../generated/prisma/client.js";

const createNewContact = async (
  email: string,
  phoneNumber: string,
  linkedId: number | null = null,
  linkPrecedence: LinkPrecedence = LinkPrecedence.primary,
  tx?: PrismaTransactionalClient,
) => {
  // use transactional client if provided, else use regular prisma client
  const contact = await (tx || prisma).contact.create({
    data: {
      email,
      phoneNumber,
      linkedId,
      linkPrecedence,
    },
  });

  return contact;
};

export const findContacts = async (email: string, phoneNumber: string) => {
  // Guarded at controller level, but adding here for safety
  if (!email && !phoneNumber) {
    throw new Error("Email or phone number is required");
  }

  // find all contacts that match the email or phone number
  const conditions = [];
  if (email) conditions.push({ email });
  if (phoneNumber) conditions.push({ phoneNumber });

  const contacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: conditions,
    },
  });

  // if no contacts found, create a new primary contact and return response
  if (contacts.length === 0) {
    const newContact = await createNewContact(email, phoneNumber);
    return {
      contact: {
        primaryContatctId: newContact.id, // !!! Typo in requirement docs - kept it as it is if needed for test cases
        emails: email ? [email] : [],
        phoneNumbers: phoneNumber ? [phoneNumber] : [],
        secondaryContactIds: [],
      },
    };
  }

  // find all primary contact IDs from the matched contacts
  // (including linkedId for secondaries, as they point to their primary contact)
  let primaryIds = new Set<number>(); // set to avoid duplicates
  for (let c of contacts) {
    if (c.linkPrecedence === LinkPrecedence.primary) {
      primaryIds.add(c.id);
    } else {
      if (c.linkedId !== null) {
        primaryIds.add(c.linkedId!);
      }
    }
  }

  let canonicalPrimaryId: number = 0; // the true primary contact ID
  let primaryContact: Contact | null = null;
  let fullGroup: Contact[] = []; // the entire linked group pointing to the primary contact

  // Everything below this should ideally be done in a DB transaction
  // to prevent data inconsistency due to modifying the multiple contacts
  await prisma.$transaction(async (tx) => {
    if (primaryIds.size > 1) {
      // if multiple primary contacts found - merge them
      const oldestPrimaryId = await mergePrimaries(Array.from(primaryIds), tx);
      canonicalPrimaryId = oldestPrimaryId;
    } else {
      // else take the only primary contact found as the canonical primary contact
      if (primaryIds.size === 0) {
        throw new Error("Data inconsistency: no primary ID found");
      }
      canonicalPrimaryId = Array.from(primaryIds)[0]!;
    }

    primaryContact = await tx.contact.findFirst({
      where: {
        deletedAt: null,
        id: canonicalPrimaryId,
      },
    });

    if (!primaryContact) {
      // This should never happen
      // data inconsistency if it does, as we have already verified existence of primary contacts above
      throw new Error("No primary contact found - possible data inconsistency");
    }

    // find full group using primary primary contact id
    // includes contacts with id == primary id or linkedId == primary id (if its a secondary contact)
    fullGroup = await tx.contact.findMany({
      where: {
        deletedAt: null,
        OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
      },
    });

    await createSecondaryIfNecessary(
      email,
      phoneNumber,
      primaryContact,
      fullGroup,
      tx,
    );
  });

  // ensure primaryContact was assigned (should always be true after successful transaction)
  if (!primaryContact) {
    throw new Error(
      "Primary contact not found after transaction - possible data inconsistency",
    );
  }

  // construct response
  const res = buildResponse(primaryContact, fullGroup);

  return res;
};

// merge primaries
// if multiple primaries found, link them to the oldest primary and convert them to secondaries
// needed for the case - Can primary contacts turn into secondary? (from requirement docs)
const mergePrimaries = async (
  primaryIds: number[],
  tx: PrismaTransactionalClient,
) => {
  const primaryContacts = await tx.contact.findMany({
    where: {
      deletedAt: null,
      id: { in: primaryIds },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (primaryContacts.length === 0) {
    throw new Error(
      "Data inconsistency: primary contacts not found for all primary IDs",
    );
  }

  const oldestPrimary = primaryContacts[0];
  if (!oldestPrimary) {
    throw new Error("Oldest primary contact not found");
  }

  const contactsToUpdate = primaryContacts.slice(1); // all except the oldest primary

  for (let contact of contactsToUpdate) {
    // convert duplicate primaries to secondaries
    // link them to the oldest primary
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        linkedId: oldestPrimary.id,
        linkPrecedence: LinkPrecedence.secondary,
      },
    });

    // relink any secondaries linked to the duplicate primary to the oldest primary
    await tx.contact.updateMany({
      where: { linkedId: contact.id },
      data: { linkedId: oldestPrimary.id },
    });
  }

  return oldestPrimary.id;
};

// check if there is new information (new email or new phone) that doesn't exist in the fullGroup
// if there is new information, create a new secondary contact linked to the primary contact
// needed for the case - When is a secondary contact created? (from requirement docs)
const createSecondaryIfNecessary = async (
  email: string,
  phoneNumber: string,
  primaryContact: Contact,
  fullGroup: Contact[],
  tx: PrismaTransactionalClient,
) => {
  const hasNewEmail = email && !fullGroup.some((c) => c.email === email);
  const hasNewPhone =
    phoneNumber && !fullGroup.some((c) => c.phoneNumber === phoneNumber);

  if (hasNewEmail || hasNewPhone) {
    const newSecondary = await createNewContact(
      email,
      phoneNumber,
      primaryContact.id,
      LinkPrecedence.secondary,
      tx,
    );

    // add the new secondary contact to the full group for response construction
    fullGroup.push({ ...newSecondary, linkedId: primaryContact.id });
  }
};

// Build response object
const buildResponse = (primaryContact: Contact, fullGroup: Contact[]) => {
  const primaryContactId = primaryContact.id;
  const emails: string[] = []; // first element being primary contact's email
  const phoneNumbers: string[] = []; // first element being primary contact's phone number
  const secondaryContactIds = new Set<number>();

  // set to ensure no duplicates in secondary emails and phone numbers
  // as there can be multiple secondary contacts with same email or phone number
  const secondaryEmails = new Set<string>();
  const secondaryPhoneNumbers = new Set<string>();

  for (let c of fullGroup) {
    if (c.id === primaryContactId) {
      if (c.email) emails.push(c.email);
      if (c.phoneNumber) phoneNumbers.push(c.phoneNumber);
    } else {
      if (c.email) secondaryEmails.add(c.email);
      if (c.phoneNumber) secondaryPhoneNumbers.add(c.phoneNumber);
      secondaryContactIds.add(c.id);
    }
  }

  // add the secondary emails and phone numbers to the primary ones, ensuring no duplicates
  for (const e of secondaryEmails) {
    if (e !== primaryContact.email) {
      emails.push(e);
    }
  }
  for (const p of secondaryPhoneNumbers) {
    if (p !== primaryContact.phoneNumber) {
      phoneNumbers.push(p);
    }
  }

  const secondaryContactIdsArray = Array.from(secondaryContactIds);

  return {
    contact: {
      primaryContatctId: primaryContactId, // !!! Typo in requirement docs - kept it as it is if needed for test cases
      emails,
      phoneNumbers,
      secondaryContactIds: secondaryContactIdsArray,
    },
  };
};
