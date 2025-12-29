const express = require("express");
const path = require("path");

const app = express();

// Increase payload limit
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

let latestMetaData = [];

// API routes
app.post("/api/meta", (req, res) => {
  latestMetaData = req.body;
  res.json({ ok: true });
});

app.get("/api/meta", (req, res) => {
  res.json(latestMetaData);
});

// ✅ Serve index.html on root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
