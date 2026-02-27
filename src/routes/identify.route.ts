import { Router } from "express";
import { fetchContacts } from "../controllers/identify.controller.js";

const router = Router();

router.post("/", fetchContacts);

export default router;
