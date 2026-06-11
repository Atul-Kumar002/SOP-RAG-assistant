# OpsMind AI - Enterprise SOP Knowledge Base Manager

OpsMind AI is an AI-powered query assistant and manager for Standard Operating Procedure (SOP) PDF documents.

## Project Structure

This project has been separated into frontend and backend components:

- **`backend/`**: Contains the Express API server, MongoDB Atlas integration, semantic chunking, and generative AI features (Gemini API).
- **`frontend/`**: Contains the HTML, CSS, and vanilla JS web application UI.

---

## Installation & Setup

1. **Backend Configuration**:
   Ensure you have a `.env` file inside the `backend` folder with your credentials:
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_uri
   GEMINI_API_KEY=your_gemini_api_key
   # Add S3 or AWS credentials if storage is S3
   ```

2. **Install Dependencies**:
   Install the backend dependencies from the root directory:
   ```bash
   npm run install:backend
   ```

---

## Running the Application

To run both the **backend API** and the **frontend static server** concurrently:

```bash
npm run dev
```

This will spin up:
- Backend server: `http://localhost:5000`
- Frontend app: `http://localhost:3000` (served via `serve-frontend.js`)

Alternatively, you can run them individually:
- Run backend: `npm run backend`
- Run frontend: `npm run frontend`
