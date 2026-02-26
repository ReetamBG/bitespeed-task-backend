import { Router } from "express";
import { createContact, fetchContacts } from "../controllers/identify.controller.js";

const router = Router();

router.post("/", fetchContacts);
router.post("/create", createContact);

export default router;
