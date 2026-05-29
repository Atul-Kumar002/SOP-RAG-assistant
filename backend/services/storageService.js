const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const provider = process.env.STORAGE_PROVIDER || 'local';

let s3Client = null;
if (provider === 's3') {
  try {
    const s3Config = {
      region: process.env.AWS_REGION || 'us-east-1',
    };
    
    // Support either explicit env configuration or fallback to AWS SDK default credential chain
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      s3Config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }
    
    s3Client = new S3Client(s3Config);
    console.log('S3 Storage Provider initialized.');
  } catch (error) {
    console.error('Failed to initialize S3 Storage Provider:', error.message);
  }
} else {
  console.log('Local Storage Provider initialized.');
}

/**
 * Uploads a file to the configured storage provider.
 * @param {Object} file - The file object from Multer.
 * @returns {Promise<{ key: string, path: string, provider: string }>}
 */
async function uploadFile(file) {
  // Generate a safe unique name
  const extension = path.extname(file.originalname).toLowerCase();
  const baseName = path.basename(file.originalname, extension).replace(/[^a-zA-Z0-9_-]/g, '');
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName}${extension}`;

  if (provider === 's3') {
    if (!s3Client) {
      throw new Error('S3 Client is not initialized. Check your credentials.');
    }
    
    const fileStream = fs.createReadStream(file.path);
    const s3Key = `documents/${uniqueName}`;
    const bucketName = process.env.AWS_BUCKET_NAME;

    if (!bucketName) {
      throw new Error('AWS_BUCKET_NAME is not configured.');
    }

    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileStream,
      ContentType: file.mimetype,
    };

    console.log(`Uploading ${file.originalname} to S3 bucket ${bucketName} as ${s3Key}...`);
    await s3Client.send(new PutObjectCommand(uploadParams));

    // Clean up local temp file after successful upload to S3
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return {
      key: s3Key,
      path: `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`,
      provider: 's3'
    };
  } else {
    // For local storage, move the file from multer's temp destination to its final unique name destination
    const destDir = path.dirname(file.path);
    const newPath = path.join(destDir, uniqueName);
    
    fs.renameSync(file.path, newPath);
    console.log(`Stored file locally at ${newPath}`);

    return {
      key: uniqueName,
      path: newPath,
      provider: 'local'
    };
  }
}

/**
 * Deletes a file from the configured storage provider.
 * @param {string} storageProvider - The storage provider ('local' or 's3').
 * @param {string} storageKey - The key/filename of the file to delete.
 * @param {string} filePath - The absolute local path or URL of the file.
 */
async function deleteFile(storageProvider, storageKey, filePath) {
  const activeProvider = storageProvider || provider;
  
  if (activeProvider === 's3') {
    if (!s3Client) {
      throw new Error('S3 Client is not initialized.');
    }
    const bucketName = process.env.AWS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('AWS_BUCKET_NAME is not configured.');
    }
    
    console.log(`Deleting S3 file key: ${storageKey} from bucket: ${bucketName}...`);
    const deleteParams = {
      Bucket: bucketName,
      Key: storageKey,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
  } else {
    // Local storage deletion
    const fileToDelete = filePath || path.join(__dirname, '../uploads', storageKey);
    console.log(`Deleting local file: ${fileToDelete}`);
    if (fs.existsSync(fileToDelete)) {
      fs.unlinkSync(fileToDelete);
    }
  }
}

module.exports = {
  uploadFile,
  deleteFile
};
