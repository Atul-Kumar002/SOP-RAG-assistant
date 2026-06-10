const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const rawUri = process.env.MONGODB_URI;

    // Support common Atlas URI format issues by lightly normalizing.
    // - mongodb+srv must not contain a port in the hostname
    // - credentials must be URL-encoded inside the URI (password especially)
    let uri = rawUri;
    if (uri) {
      // Remove accidental :<port> after the hostname for mongodb+srv URIs.
      uri = uri.replace(/(mongodb\+srv:\/\/[^@\/]+)(:\d+)(\/)/i, '$1$3');

      // If URI has a username:password@ section and includes a colon in the password,
      // it may be unescaped. Encode the password portion when it looks unencoded.
      // Example: mongodb+srv://user:pass@host/...
      uri = uri.replace(/^(mongodb\+srv:\/\/[^:]+:)([^@/]+)(@.+)$/i, (m, p1, p2, p3) => {
        // If it already looks percent-encoded, don't double-encode.
        if (/%[0-9A-Fa-f]{2}/.test(p2)) return m;
        return `${p1}${encodeURIComponent(p2)}${p3}`;
      });
    }

    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
