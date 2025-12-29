const express = require("express");
const app = express();

//  Increase payload limit
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

let latestMetaData = [];

app.post("/api/meta", (req, res) => {
  latestMetaData = req.body;
  res.json({ ok: true });
});

app.get("/api/meta", (req, res) => {
  res.json(latestMetaData);
});

app.listen(process.env.PORT || 3000);