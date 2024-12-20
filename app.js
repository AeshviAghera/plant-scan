require("dotenv").config();
const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 2206;

// Configure Multer for file uploads
const upload = multer({ dest: "uploads/" });
app.use(express.json({ limit: "10mb" }));

// Serve static files from the `public` directory
app.use(express.static("public"));

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Route: Analyze Plant Image
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const imagePath = req.file.path;
    const imageData = await fsPromises.readFile(imagePath, { encoding: "base64" });

    // Use Google Generative AI to analyze the image
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([
      "Analyze this plant image and provide a detailed analysis of its species, health, care instructions, and any interesting facts in plain text without markdown.",
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageData,
        },
      },
    ]);

    const plantInfo = result.response.text();

    // Clean up: Delete the uploaded file
    await fsPromises.unlink(imagePath);

    res.json({
      result: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
    });
  } catch (error) {
    console.error("Error analyzing image:", error.message);
    res.status(500).json({ error: "An error occurred while analyzing the image." });
  }
});

// Route: Download PDF Report
app.post("/download", express.json(), async (req, res) => {
  const { result, image } = req.body;

  try {
    const reportsDir = path.join(__dirname, "reports");
    await fsPromises.mkdir(reportsDir, { recursive: true });

    const filename = `plant_analysis_report_${Date.now()}.pdf`;
    const filePath = path.join(reportsDir, filename);

    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Add content to the PDF
    doc.fontSize(24).text("Plant Analysis Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(12).text(result, { align: "left" });

    // Add the image if available
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.addPage();
      doc.image(buffer, { fit: [500, 400], align: "center", valign: "center" });
    }

    doc.end();

    // Wait for PDF creation
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    res.download(filePath, (err) => {
      if (err) {
        console.error("Error downloading PDF:", err.message);
        res.status(500).json({ error: "Error downloading the PDF report." });
      }
      fsPromises.unlink(filePath);
    });
  } catch (error) {
    console.error("Error generating PDF report:", error.message);
    res.status(500).json({ error: "An error occurred while generating the PDF report." });
  }
});

// Start the Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
