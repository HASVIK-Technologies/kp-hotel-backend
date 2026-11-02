export const ROOM_TYPES = ["Deluxe", "Premium", "Suite", "Family", "Twin"] as const;
export const ROOM_VIEWS = ["City", "Garden", "Pool"] as const;
export const AMENITY_FLAGS = ["WiFi", "Breakfast", "Balcony", "Bathtub"] as const;

export type RoomType = (typeof ROOM_TYPES)[number];
export type RoomView = (typeof ROOM_VIEWS)[number];
export type AmenityFlag = (typeof AMENITY_FLAGS)[number];

/**
 * A bookable room category (e.g. "Deluxe Room"), not a physical room number.
 * `inventory` is how many physical rooms of this category the hotel has.
 * `images` are file names inside the frontend's `public/images/rooms/` folder (or absolute URLs).
 */
export interface Room {
  slug: string;
  name: string;
  type: RoomType;
  view: RoomView;
  headline: string;
  blurb: string;
  description: string;
  price: number; // per night, INR, excl. tax
  mrp?: number; // strike-through price
  maxGuests: number;
  beds: string;
  size: number; // sqm
  rating: number; // 0 until reviews exist
  reviews: number;
  amenityFlags: AmenityFlag[];
  amenities: string[];
  images: string[];
  inventory: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** What the public website receives: adds live availability, hides nothing sensitive. */
export type PublicRoom = Room & { roomsLeft: number };
