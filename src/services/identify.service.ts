import { prisma } from "../lib/prisma.js";
import { LinkPrecedence } from "../generated/prisma/client.js";

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

  if (primaryIds.size > 1) {
    // TODO: merge needed
    console.log("Merge required for contacts: ", contacts);
    throw new Error("Multiple primary contacts found, merge required. This is not implemented yet.");
  }

  const primaryContact = await prisma.contact.findFirst({
    where: {
      deletedAt: null,
      id: { in: Array.from(primaryIds) },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!primaryContact) {
    // TODO: create a new contact if no primary contact found, but for now just throw an error
    throw new Error("No primary contact found");
  }

  const fullGroup = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [{ id: primaryContact.id }, { linkedId: primaryContact.id }],
    },
  });

  // check if a contact with same email or phone number exists in the fullGroup
  // if yes then do nothing else create a new secondary contact linked to the primary contact
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

  // construct response
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

  const res = {
    contact: {
      primaryContactId,
      emails,
      phoneNumbers,
      secondaryContactIds: secondaryContactIdsArray,
    },
  };

  console.log("Matched contact:", contacts);
  console.log("Primary contact IDs:", primaryIds);
  console.log("Chosen primary: ", primaryContact);
  console.log("Full group: ", fullGroup);

  return res;
};
