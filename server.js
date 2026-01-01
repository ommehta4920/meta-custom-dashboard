const express = require("express");
const path = require("path");

const app = express();

// Payload limits
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

// ✅ Serve all static files from root folder
app.use(express.static(path.join(__dirname)));

// ✅ Explicit root fallback (important)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
