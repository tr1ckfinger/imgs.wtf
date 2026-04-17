import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

const CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME ?? import.meta.env.CLOUDINARY_CLOUD_NAME;
const API_KEY =
  process.env.CLOUDINARY_API_KEY ?? import.meta.env.CLOUDINARY_API_KEY;
const API_SECRET =
  process.env.CLOUDINARY_API_SECRET ?? import.meta.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

export type CldImage = {
  public_id: string;
  width: number;
  height: number;
  format: string;
  tags?: string[];
  context?: Record<string, string>;
};

export type Album = {
  slug: string;
  title: string;
  cover: CldImage;
  images: CldImage[];
};

function titleFromSlug(slug: string) {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function listFolders(): Promise<string[]> {
  const res: any = await cloudinary.api.root_folders();
  return (res.folders ?? []).map((f: any) => f.name);
}

async function listImagesInFolder(folder: string): Promise<CldImage[]> {
  const res: any = await cloudinary.search
    .expression(`folder:${folder}/*`)
    .with_field('tags')
    .with_field('context')
    .sort_by('public_id', 'asc')
    .max_results(500)
    .execute();

  return (res.resources ?? []).map((r: any) => ({
    public_id: r.public_id,
    width: r.width,
    height: r.height,
    format: r.format,
    tags: r.tags ?? [],
    context: r.context?.custom ?? {},
  }));
}

let albumsPromise: Promise<Album[]> | null = null;

async function fetchAlbums(): Promise<Album[]> {
  const folders = await listFolders();
  const albums: Album[] = [];

  for (const folder of folders) {
    const images = await listImagesInFolder(folder);
    if (images.length === 0) continue;

    const cover = images.find((i) => i.tags?.includes('cover')) ?? images[0];

    albums.push({
      slug: folder,
      title: titleFromSlug(folder),
      cover,
      images,
    });
  }

  return albums;
}

export async function getAlbums(): Promise<Album[]> {
  if (!albumsPromise) {
    albumsPromise = fetchAlbums().catch((err) => {
      albumsPromise = null; // allow retry on failure
      throw err;
    });
  }
  return albumsPromise;
}

export function cldUrl(
  publicId: string,
  opts: { w?: number; h?: number; crop?: string; q?: string } = {}
) {
  const { w, h, crop = 'fill', q = 'auto' } = opts;
  const parts: string[] = [`f_auto`, `q_${q}`];
  if (w) parts.push(`w_${w}`);
  if (h) parts.push(`h_${h}`);
  if (w || h) parts.push(`c_${crop}`);
  const transform = parts.join(',');
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${publicId}`;
}
