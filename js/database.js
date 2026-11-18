import { FIREBASE_CONFIG } from './config.js';

const INITIAL_SERVICES = [
  {
    id: "srv_1",
    name: "مركز النخبة الطبي التخصصي",
    category: "medical",
    area: "الشيخ زايد",
    address: "شارع شبين الكوم، بجوار المسجد الكبير",
    phone: "01001234567",
    whatsapp: "201001234567",
    mapUrl: "https://maps.google.com/?q=30.6043,32.2723",
    openHour: 0,
    closeHour: 24,
    isEmergency: true,
    verified: true,
    rating: 4.9,
    reviewsCount: 142,
    tags: "باطنة، أطفال، تحاليل، أشعة، طوارئ",
    menu: [
      { item: "كشف استشاري", price: "300 ج.م" },
      { item: "تحليل صورة دم كاملة", price: "180 ج.م" }
    ]
  },
  {
    id: "srv_2",
    name: "أسماك القناة للمأكولات البحرية",
    category: "food",
    area: "طريق البلاجات",
    address: "أمام نادي الشراع مباشرة",
    phone: "01009876543",
    whatsapp: "201009876543",
    mapUrl: "https://maps.google.com/?q=30.5833,32.2667",
    openHour: 12,
    closeHour: 2,
    isEmergency: false,
    verified: true,
    rating: 4.8,
    reviewsCount: 310,
    tags: "سمك، جمبري، طواجن، دليفري سريع",
    menu: [
      { item: "وجبة جمبري جامبو", price: "420 ج.م" },
      { item: "طاجن سي فود بالكريمة", price: "280 ج.م" }
    ]
  },
  {
    id: "srv_3",
    name: "المركز الهندسي لصيانة التكييف والأجهزة",
    category: "maintenance",
    area: "حي ثالث",
    address: "المنطقة الخامسة، خلف الموقف الجديد",
    phone: "01112223334",
    whatsapp: "201112223334",
    mapUrl: "https://maps.google.com/?q=30.6100,32.2650",
    openHour: 9,
    closeHour: 23,
    isEmergency: true,
    verified: true,
    rating: 4.7,
    reviewsCount: 89,
    tags: "شحن فريون، صيانة تكييف، ثلاجات، غسالات",
    menu: [
      { item: "كشف وتحديد عطل", price: "150 ج.م" },
      { item: "صيانة وغسيل تكييف", price: "350 ج.م" }
    ]
  }
];

class DatabaseService {
  constructor() {
    this.storageKey = 'ismailia_superapp_db_v1';
    this.useFirebase = Boolean(FIREBASE_CONFIG.apiKey);
    this.init();
  }

  init() {
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify(INITIAL_SERVICES));
    }
  }

  async getAllServices() {
    const data = JSON.parse(localStorage.getItem(this.storageKey)) || [];
    return data;
  }

  async addService(newService) {
    const services = await this.getAllServices();
    const record = {
      ...newService,
      id: 'srv_' + Date.now(),
      rating: 5.0,
      reviewsCount: 1,
      verified: true,
      menu: newService.menu || []
    };
    services.unshift(record);
    localStorage.setItem(this.storageKey, JSON.stringify(services));
    return record;
  }

  async deleteService(id) {
    let services = await this.getAllServices();
    services = services.filter(s => s.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(services));
  }
}

export const db = new DatabaseService();