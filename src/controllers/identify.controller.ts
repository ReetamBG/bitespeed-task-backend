import type { Request, Response } from "express";
import {
  createNewContact,
  findContacts,
} from "../services/identify.service.js";

export const fetchContacts = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
    console.log("Received data:", { email, phoneNumber });
    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Email or phone number is required",
      });
    }

    const serviceResponse = await findContacts(email, phoneNumber);

    res.status(201).json({
      success: true,
      contact: serviceResponse.contact,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to create contact",
    });
  }
};

export const createContact = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
    console.log("Received data for creation:", { email, phoneNumber });
    if (!email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Email or phone number is required",
      });
    }

    const contact = await createNewContact(email, phoneNumber);

    res.status(201).json({
      success: true,
      data: contact,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to create contact",
    });
  }
};
