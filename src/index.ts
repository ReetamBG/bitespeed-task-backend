import express from "express";
import identifyRoutes from "./routes/identify.route.js";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors())  // added this in case it is needed for testing with frontend, can be removed if not needed
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/identify", identifyRoutes);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
