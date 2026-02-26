import express from "express";
import identifyRoutes from "./routes/identify.route.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/identify", identifyRoutes);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
