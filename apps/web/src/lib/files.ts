// No hay almacenamiento de archivos (S3/Cloudinary) configurado todavía - para una app que
// aún no está en producción, se guarda la imagen como data URL (base64) directo en la
// columna de la base. Hay que revisar esto cuando se configure almacenamiento real: fotos
// grandes de muchos conductores van a pesar en la tabla.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB - tope sobre el ARCHIVO ORIGINAL (antes de redimensionar).

// Las fotos de licencia/incidencia se muestran siempre como miniatura chica (ver Drivers.tsx,
// RouteDetail.tsx) - no hace falta transferir ni guardar la foto a resolución de cámara de
// celular (3000-4000px). Redimensionada+recomprimida, una foto que pesaba 1-2MB en base64
// queda en decenas de KB - mucho más liviano para subir y para volver a descargar cada vez
// que se lista/abre esa pantalla desde datos móviles.
const MAX_DIMENSION_PX = 1280;
const JPEG_QUALITY = 0.75;

async function resizeToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar el lienzo");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

function readRaw(file: File): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

/**
 * Lee un <input type="file"> como data URL ya redimensionada/comprimida - null si no se
 * eligió nada. Si el navegador no soporta canvas/createImageBitmap, o el archivo no es una
 * imagen decodificable, cae en subir el original sin tocar (mismo comportamiento de antes).
 */
export async function fileToDataUrl(file: File | null): Promise<string | null> {
  if (!file) return null;
  if (file.size > MAX_PHOTO_BYTES) throw new Error("La imagen pesa más de 2MB");
  try {
    return await resizeToDataUrl(file);
  } catch {
    return readRaw(file);
  }
}
