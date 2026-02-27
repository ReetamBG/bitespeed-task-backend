import { prisma } from "../lib/prisma.js";
import { LinkPrecedence, type Contact } from "../generated/prisma/client.js";

export const createNewContact = async (
  email: string,
  phoneNumber: string,
  linkedId: number | null = null,
  linkPrecedence: LinkPrecedence = LinkPrecedence.primary,
) => {
  console.log("Creating contact with:", { email, phoneNumber });
  const contact = await prisma.contact.create({
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

  const conditions = [];
  if (email) conditions.push({ email });
  if (phoneNumber) conditions.push({ phoneNumber });

  const contacts = await prisma.contact.findMany({
    where: {
      deletedAt: null, // TODO: Do i really need this ? - Yes, due to soft delete
      OR: conditions,
    },
  });

  if (contacts.length === 0) {
    const newContact = await createNewContact(email, phoneNumber);
    return {
      contact: {
        primaryContactId: newContact.id,
        emails: email ? [email] : [],
        phoneNumbers: phoneNumber ? [phoneNumber] : [],
        secondaryContactIds: [],
      },
    };
  }

  let primaryIds = new Set<number>();
  for (let c of contacts) {
    if (c.linkPrecedence === LinkPrecedence.primary) {
      primaryIds.add(c.id);
    } else {
      if (c.linkedId !== null) {
        primaryIds.add(c.linkedId!);
      }
    }
  }

  let canonicalPrimaryId: number;

  if (primaryIds.size > 1) {
    // merge primaries if multiple primary contacts found
    const oldestPrimaryId = await mergePrimaries(Array.from(primaryIds));
    canonicalPrimaryId = oldestPrimaryId;
  } else {
    if (primaryIds.size === 0) {
      throw new Error("Data inconsistency: no primary ID found");
    }
    canonicalPrimaryId = Array.from(primaryIds)[0]!;
  }

  const primaryContact = await prisma.contact.findFirst({
    where: {
      deletedAt: null,
      id: canonicalPrimaryId,
    },
  });

  if (!primaryContact) {
    // This should never happen, data inconsistency if it does
    // as we have already verified existence of primary contacts above
    throw new Error("No primary contact found");
  }

  const fullGroup = await prisma.contact.findMany({
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
  );

  // construct response
  const res = buildResponse(primaryContact, fullGroup);

  console.log("Matched contact:", contacts);
  console.log("Primary contact IDs:", primaryIds);
  console.log("Chosen primary: ", primaryContact);
  console.log("Full group: ", fullGroup);

  return res;
};

// merge primaries
// if multiple primaries found, link them to the oldest primary and convert them to secondaries
const mergePrimaries = async (primaryIds: number[]) => {
  const primaryContacts = await prisma.contact.findMany({
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

  // TODO: start DB transaction
  // Transaction needed to ensure that all updates happen atomically,
  // preventing data inconsistency as we are updating multiple records together

  const result = await prisma.$transaction(async (tx) => {
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
  });

  return oldestPrimary.id;
};

// check if a contact with same email or phone number exists in the fullGroup
// if yes then do nothing else create a new secondary contact linked to the primary contact
const createSecondaryIfNecessary = async (
  email: string,
  phoneNumber: string,
  primaryContact: Contact,
  fullGroup: Contact[],
) => {
  const alreadyExists = fullGroup.some(
    (c) =>
      (email ? c.email === email : true) && // true if email is not provided
      (phoneNumber ? c.phoneNumber === phoneNumber : true), // true if phone number is not provided
  );

  if (!alreadyExists) {
    const newSecondary = await createNewContact(
      email,
      phoneNumber,
      primaryContact.id,
      LinkPrecedence.secondary,
    );

    fullGroup.push({ ...newSecondary, linkedId: primaryContact.id }); // add the new secondary contact to the full group for response construction
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
  emails.push(...secondaryEmails);
  phoneNumbers.push(...secondaryPhoneNumbers);
  const secondaryContactIdsArray = Array.from(secondaryContactIds);

  return {
    contact: {
      primaryContactId,
      emails,
      phoneNumbers,
      secondaryContactIds: secondaryContactIdsArray,
    },
  };
};
