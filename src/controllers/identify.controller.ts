import type { Request, Response } from "express";
import { createContact } from "../services/identify.service.js";

export const insertContact = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
    console.log("Received data:", { email, phoneNumber });

    const contact = await createContact(email, phoneNumber);

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
