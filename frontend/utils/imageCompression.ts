import imageCompression from 'browser-image-compression';

export async function compressImages(files: File[]): Promise<File[]> {
  const options = {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1920,
    useWebWorker: true
  };
  
  const compressedFiles = await Promise.all(
    files.map(async (file) => {
      // Only compress images, ignore PDFs etc.
      if (!file.type.startsWith('image/')) return file;
      try {
        const compressedBlob = await imageCompression(file, options);
        // Convert Blob to File to match the expected type
        return new File([compressedBlob], file.name, { type: file.type, lastModified: Date.now() });
      } catch (error) {
        console.error('Image compression error:', error);
        return file; // fallback to original on error
      }
    })
  );
  
  return compressedFiles;
}
