import type { Request, Response } from "express";
import { findContacts } from "../services/identify.service.js";

export const fetchContacts = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;

    // atleast one of email or phone number should be present
    if (!email && !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Email or phone number is required",
      });
    }

    const serviceResponse = await findContacts(email, phoneNumber);

    res.status(200).json(serviceResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to create contact",
    });
  }
};
