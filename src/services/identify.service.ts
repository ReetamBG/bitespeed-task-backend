import { prisma } from "../lib/prisma.js";
import { LinkPrecedence } from "../generated/prisma/client.js";

export const createContact = async (email: string, phoneNumber: string) => {
  console.log("Creating contact with:", { email, phoneNumber });
  const contact = await prisma.contact.create({
    data: {
      email,
      phoneNumber,
      linkPrecedence: LinkPrecedence.primary,
    },
  });

  return contact;
};
