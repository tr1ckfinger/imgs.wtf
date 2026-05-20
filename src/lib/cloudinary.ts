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

export type AlbumCategory = 'album' | 'project';

export type Album = {
  slug: string;
  title: string;
  category: AlbumCategory;
  cover: CldImage;
  images: CldImage[];
};

// Cloudinary parent folders. Two top-level folders organise the work
// into albums (personal series) and projects (commissioned / themed
// work). Each subfolder under one of these parents becomes one Album.
const PARENT_BY_CATEGORY: Record<AlbumCategory, string> = {
  album: 'Albums',
  project: 'Projects',
};

// Album titles are the raw folder name, lowercased, with spaces and
// dashes/underscores all rendered as a single space. Folder "New York"
// → "new york"; folder "street-life" → "street life".
function titleFromFolder(folder: string) {
  return folder.replace(/[-_]/g, ' ').toLowerCase();
}

// URL slugs can't contain spaces, so collapse any whitespace run to a
// single hyphen and lowercase the rest. Folder "New York" → "new-york";
// folder "street-life" stays "street-life".
function slugFromFolder(folder: string) {
  return folder.trim().toLowerCase().replace(/\s+/g, '-');
}

async function listSubFolders(parent: string): Promise<string[]> {
  try {
    const res: any = await cloudinary.api.sub_folders(parent);
    return (res.folders ?? []).map((f: any) => f.name);
  } catch (err: any) {
    // If a parent folder doesn't exist yet (e.g. the site has albums
    // but no projects yet) Cloudinary returns 404 — treat as empty so
    // the build doesn't fail.
    if (err?.error?.http_code === 404 || err?.http_code === 404) return [];
    throw err;
  }
}

async function listImagesInFolder(folderPath: string): Promise<CldImage[]> {
  // Quote the folder path so any spaces in folder names are parsed as
  // part of the path segment instead of splitting the search expression.
  // Sort newest-first by upload time: photos within a series appear
  // with the most recent shoot at the top, and as new images are added
  // to a folder they show up first on the page instead of getting
  // buried at the bottom.
  const res: any = await cloudinary.search
    .expression(`folder:"${folderPath}/*"`)
    .with_field('tags')
    .with_field('context')
    .sort_by('uploaded_at', 'desc')
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
  const out: Album[] = [];

  for (const category of Object.keys(PARENT_BY_CATEGORY) as AlbumCategory[]) {
    const parent = PARENT_BY_CATEGORY[category];
    const subs = await listSubFolders(parent);

    for (const sub of subs) {
      const folderPath = `${parent}/${sub}`;
      const images = await listImagesInFolder(folderPath);
      if (images.length === 0) continue;

      const cover = images.find((i) => i.tags?.includes('cover')) ?? images[0];

      out.push({
        slug: slugFromFolder(sub),
        title: titleFromFolder(sub),
        category,
        cover,
        images,
      });
    }
  }

  return out;
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

// URL helpers. Routes are namespaced (/albums/<slug>, /projects/<slug>)
// so a folder named "New York" can exist in both parents without slug
// collision.
export function categoryToPath(category: AlbumCategory): 'albums' | 'projects' {
  return category === 'album' ? 'albums' : 'projects';
}

export function categoryListingPath(category: AlbumCategory): string {
  return `/${categoryToPath(category)}`;
}

export function albumHref(album: Album): string {
  return `/${categoryToPath(album.category)}/${album.slug}`;
}

export function albumLabel(album: Album): string {
  return album.category === 'album' ? 'Go to album' : 'Go to project';
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
