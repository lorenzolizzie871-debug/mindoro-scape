export type AmenityIcon =
  | 'wifi'
  | 'pool'
  | 'spa'
  | 'dining'
  | 'boat'
  | 'ac'
  | 'kayak'
  | 'desk'
  | 'dive'
  | 'parking'
  | 'tour'
  | 'breakfast'
  | 'bar'
  | 'hall'
  | 'view';

export type FactIcon = 'beach' | 'pool' | 'dive' | 'wifi' | 'eco' | 'boat' | 'food' | 'city';

export type RoomType = {
  id: string;
  name: string;
  badge: string;
  size: string;
  description: string;
  price: number;
  note: string;
  image: string;
};

export type Review = {
  name: string;
  initials: string;
  stay: string;
  rating: number;
  text: string;
};

export type Resort = {
  id: number;
  name: string;
  location: string;
  municipality: string;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  amenities: string[];
  categories: string[];

  // Detail page content
  tagline: string;
  address: string;
  facts: { label: string; value: string; icon: FactIcon }[];
  about: string;
  keyAmenities: { label: string; icon: AmenityIcon }[];
  gallery: string[];
  rooms: RoomType[];
  locationName: string;
  locationCove: string;
  travel: { label: string; value: string; icon: 'boat' | 'car' }[];
  guestReviews: Review[];
};

export const resorts: Resort[] = [
  {
    id: 1,
    name: 'Fridays Puerto Galera',
    location: 'Boquete Island, Puerto Galera',
    municipality: 'Puerto Galera',
    price: 8500,
    rating: 4.9,
    reviews: 214,
    image:
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1000&q=85',
    amenities: ['Beachfront', 'Infinity Pool', 'Dive Center', 'WiFi'],
    categories: ['Beachfront', 'With Pool', 'Luxury'],

    tagline: 'Luxury Coastal Sanctuary',
    address: 'Boquete Island, Puerto Galera, Oriental Mindoro',
    facts: [
      { label: 'Setting', value: 'Beachfront', icon: 'beach' },
      { label: 'Water', value: '2 Pools', icon: 'pool' },
      { label: 'Center', value: 'PADI Dive', icon: 'dive' },
      { label: 'Speed', value: 'Fast WiFi', icon: 'wifi' },
    ],
    about:
      'Set between the foothills of Mount Halcon and the marine corridor of Verde Island Passage, Fridays Puerto Galera offers an intimate luxury escape. Spread across landscaped tropical gardens, the resort pairs warm Filipino hospitality with contemporary design, private plunge cabanas, and ocean-to-table dining.',
    keyAmenities: [
      { label: 'High-Speed WiFi', icon: 'wifi' },
      { label: 'Infinity Lagoon Pool', icon: 'pool' },
      { label: 'Malasimbo Spa', icon: 'spa' },
      { label: 'Oceanfront Dining', icon: 'dining' },
      { label: 'Pier Boat Transfer', icon: 'boat' },
      { label: 'AC Luxury Villas', icon: 'ac' },
      { label: 'Snorkel & Kayaks', icon: 'kayak' },
      { label: '24/7 Island Desk', icon: 'desk' },
    ],
    gallery: [
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1000&q=80',
    ],
    rooms: [
      {
        id: 'deluxe-ocean-villa',
        name: 'Deluxe Ocean Villa',
        badge: 'Most Popular',
        size: '52 m²',
        description: 'King bed • Sea-view private balcony • Plated breakfast for 2',
        price: 8500,
        note: 'Taxes & eco-fees included',
        image:
          'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1000&q=80',
      },
      {
        id: 'premier-family-suite',
        name: 'Premier Family Suite',
        badge: 'Direct Pool Access',
        size: '78 m²',
        description: '2 Queen beds • Steps to lagoon pool • Complimentary kayak gear',
        price: 11500,
        note: 'Includes 4 guest passes',
        image:
          'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
      },
    ],
    locationName: 'Boquete Island Beach',
    locationCove: 'Boquete Cove',
    travel: [
      { label: 'Muelle Pier', value: '~30 mins drive', icon: 'boat' },
      { label: 'White Beach', value: '~15 mins ride', icon: 'car' },
    ],
    guestReviews: [
      {
        name: 'Maria Lourdes C.',
        initials: 'ML',
        stay: 'Stayed 3 nights • March 2026',
        rating: 5,
        text: 'Absolute paradise away from the crowded strip. Watching the sunrise over Verde Island from our balcony was unforgettable. Staff arranged our dive permit in minutes.',
      },
      {
        name: 'Joshua Tan',
        initials: 'JT',
        stay: 'Stayed 2 nights • February 2026',
        rating: 5,
        text: 'The spa cabana massage with the ocean breeze was the highlight of our Mindoro getaway. Super clean rooms and world-class hospitality.',
      },
    ],
  },
  {
    id: 2,
    name: 'Southdrive Beach Resort',
    location: 'San Jose, Bulalacao',
    municipality: 'Bulalacao',
    price: 3800,
    rating: 4.8,
    reviews: 88,
    image:
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=85',
    amenities: ['Island Hopping', 'Private Beach', 'Bar & Grill'],
    categories: ['Beachfront', 'Budget Friendly'],

    tagline: 'Island Beach Escape',
    address: 'San Jose, Bulalacao, Oriental Mindoro',
    facts: [
      { label: 'Setting', value: 'Beachfront', icon: 'beach' },
      { label: 'Trips', value: 'Island Hop', icon: 'boat' },
      { label: 'Dining', value: 'Bar & Grill', icon: 'food' },
      { label: 'Speed', value: 'WiFi', icon: 'wifi' },
    ],
    about:
      'Southdrive Beach Resort sits on a quiet stretch of white sand in Bulalacao, close to the sandbars and islands the area is known for. Relaxed cottages, a beachside bar and grill, and easy island-hopping arrangements make it a laid-back base for friends and families.',
    keyAmenities: [
      { label: 'Island Hopping', icon: 'boat' },
      { label: 'Private Beach', icon: 'view' },
      { label: 'Bar & Grill', icon: 'bar' },
      { label: 'Snorkel & Kayaks', icon: 'kayak' },
      { label: 'Free WiFi', icon: 'wifi' },
      { label: 'AC Cottages', icon: 'ac' },
      { label: 'Free Parking', icon: 'parking' },
      { label: 'Front Desk', icon: 'desk' },
    ],
    gallery: [
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1000&q=80',
    ],
    rooms: [
      {
        id: 'beachfront-cottage',
        name: 'Beachfront Cottage',
        badge: 'Most Popular',
        size: '32 m²',
        description: 'Queen bed • Veranda facing the sea • Fan or AC option',
        price: 3800,
        note: 'Good for 2 guests',
        image:
          'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1000&q=80',
      },
      {
        id: 'family-cottage',
        name: 'Family Cottage',
        badge: 'Great for Groups',
        size: '48 m²',
        description: '2 Double beds • Dining nook • Steps from the shore',
        price: 5600,
        note: 'Good for up to 5 guests',
        image:
          'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
      },
    ],
    locationName: 'San Jose Beach',
    locationCove: 'San Jose, Bulalacao',
    travel: [
      { label: 'Bulalacao Port', value: '~15 mins drive', icon: 'boat' },
      { label: 'Town Center', value: '~10 mins ride', icon: 'car' },
    ],
    guestReviews: [
      {
        name: 'Angelica R.',
        initials: 'AR',
        stay: 'Stayed 2 nights • April 2026',
        rating: 5,
        text: 'Quiet, clean, and the island hopping was worth every peso. The staff grilled fresh fish for us right on the beach.',
      },
      {
        name: 'Paolo M.',
        initials: 'PM',
        stay: 'Stayed 3 nights • January 2026',
        rating: 4,
        text: 'Simple cottages but a beautiful beach. Perfect for switching off for a few days with the barkada.',
      },
    ],
  },
  {
    id: 3,
    name: 'The Mangyan Heritage Eco-Cove',
    location: 'San Teodoro, Oriental Mindoro',
    municipality: 'San Teodoro',
    price: 2900,
    rating: 4.7,
    reviews: 52,
    image:
      'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1000&q=85',
    amenities: ['Eco-Friendly', 'River Tour', 'Breakfast Included'],
    categories: ['Eco Resort', 'Budget Friendly'],

    tagline: 'Eco Retreat',
    address: 'San Teodoro, Oriental Mindoro',
    facts: [
      { label: 'Setting', value: 'Eco Cove', icon: 'eco' },
      { label: 'Tours', value: 'River Tour', icon: 'boat' },
      { label: 'Meals', value: 'Breakfast', icon: 'food' },
      { label: 'Vibe', value: 'Quiet', icon: 'beach' },
    ],
    about:
      'Surrounded by greenery and close to the river, The Mangyan Heritage Eco-Cove is built around local materials and a respect for the culture of the area. Guests wake up to birdsong, enjoy a hearty breakfast, and can join guided river tours that introduce the landscape and its communities.',
    keyAmenities: [
      { label: 'Eco-Friendly Stay', icon: 'view' },
      { label: 'Guided River Tour', icon: 'tour' },
      { label: 'Breakfast Included', icon: 'breakfast' },
      { label: 'Garden Dining', icon: 'dining' },
      { label: 'Free WiFi', icon: 'wifi' },
      { label: 'Free Parking', icon: 'parking' },
      { label: 'Kayaks', icon: 'kayak' },
      { label: 'Front Desk', icon: 'desk' },
    ],
    gallery: [
      'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1000&q=80',
    ],
    rooms: [
      {
        id: 'bamboo-garden-hut',
        name: 'Bamboo Garden Hut',
        badge: 'Most Popular',
        size: '28 m²',
        description: 'Queen bed • Garden view • Breakfast for 2',
        price: 2900,
        note: 'Good for 2 guests',
        image:
          'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1000&q=80',
      },
      {
        id: 'riverside-family-hut',
        name: 'Riverside Family Hut',
        badge: 'River View',
        size: '44 m²',
        description: '2 Double beds • Riverside deck • Breakfast for 4',
        price: 4800,
        note: 'Good for up to 4 guests',
        image:
          'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
      },
    ],
    locationName: 'San Teodoro',
    locationCove: 'San Teodoro Riverside',
    travel: [
      { label: 'Calapan Port', value: '~1.5 hrs drive', icon: 'boat' },
      { label: 'Town Proper', value: '~10 mins ride', icon: 'car' },
    ],
    guestReviews: [
      {
        name: 'Karla S.',
        initials: 'KS',
        stay: 'Stayed 2 nights • March 2026',
        rating: 5,
        text: 'A calm, beautiful place. The river tour was a highlight and the breakfast was generous and delicious.',
      },
      {
        name: 'Ben D.',
        initials: 'BD',
        stay: 'Stayed 1 night • December 2025',
        rating: 4,
        text: 'Lovely setting and very friendly staff. Bring mosquito repellent and enjoy the quiet.',
      },
    ],
  },
  {
    id: 4,
    name: 'Calapan Bayfront Haven',
    location: 'Calapan City, Oriental Mindoro',
    municipality: 'Calapan City',
    price: 3200,
    rating: 4.6,
    reviews: 130,
    image:
      'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?auto=format&fit=crop&w=1000&q=85',
    amenities: ['Oceanview', 'Event Hall', 'Free Parking'],
    categories: ['With Pool', 'Budget Friendly'],

    tagline: 'Bayfront City Stay',
    address: 'Calapan City, Oriental Mindoro',
    facts: [
      { label: 'Setting', value: 'Bayfront', icon: 'city' },
      { label: 'Water', value: 'Pool', icon: 'pool' },
      { label: 'Events', value: 'Event Hall', icon: 'food' },
      { label: 'Speed', value: 'Fast WiFi', icon: 'wifi' },
    ],
    about:
      'Calapan Bayfront Haven blends city convenience with an ocean view. Close to the port and the city center, it offers a pool, an event hall for gatherings, and free parking, which makes it easy for both travelers passing through and groups celebrating in town.',
    keyAmenities: [
      { label: 'Ocean View Rooms', icon: 'view' },
      { label: 'Swimming Pool', icon: 'pool' },
      { label: 'Event Hall', icon: 'hall' },
      { label: 'Free Parking', icon: 'parking' },
      { label: 'High-Speed WiFi', icon: 'wifi' },
      { label: 'AC Rooms', icon: 'ac' },
      { label: 'Restaurant', icon: 'dining' },
      { label: '24/7 Front Desk', icon: 'desk' },
    ],
    gallery: [
      'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1000&q=80',
    ],
    rooms: [
      {
        id: 'bay-view-room',
        name: 'Bay View Room',
        badge: 'Most Popular',
        size: '30 m²',
        description: 'Queen bed • Ocean-view window • Free parking',
        price: 3200,
        note: 'Good for 2 guests',
        image:
          'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1000&q=80',
      },
      {
        id: 'family-suite',
        name: 'Family Suite',
        badge: 'Pool Access',
        size: '54 m²',
        description: '2 Queen beds • Living area • Close to the pool',
        price: 5200,
        note: 'Good for up to 4 guests',
        image:
          'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=80',
      },
    ],
    locationName: 'Calapan Bayfront',
    locationCove: 'Calapan Bay',
    travel: [
      { label: 'Calapan Port', value: '~10 mins drive', icon: 'boat' },
      { label: 'City Center', value: '~5 mins ride', icon: 'car' },
    ],
    guestReviews: [
      {
        name: 'Rhea P.',
        initials: 'RP',
        stay: 'Stayed 2 nights • May 2026',
        rating: 5,
        text: 'Very convenient location and the staff were helpful. We held a small family gathering in the event hall and it went smoothly.',
      },
      {
        name: 'Carlo V.',
        initials: 'CV',
        stay: 'Stayed 1 night • February 2026',
        rating: 4,
        text: 'Good value for the area, with a nice view of the bay from our room. Easy parking too.',
      },
    ],
  },
];

export const getResortById = (id: number) =>
  resorts.find((resort) => resort.id === id);