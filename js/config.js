export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAvjpTWRt4dqG1h3gTojBM9d0t6Hw4-CB8",
  authDomain: "ismailia-hub.firebaseapp.com",
  projectId: "ismailia-hub",
  storageBucket: "ismailia-hub.firebasestorage.app",
  messagingSenderId: "1004166596158",
  appId: "1:1004166596158:web:bd92cb412498ee090f336f"
};

// البريد الوحيد المسموح له بالدخول إلى لوحة الإدارة.
// الدخول يتم عبر Firebase Auth فقط — لا يوجد أي رقم سري في الكود.
export const ADMIN_EMAIL = "ahm3d.atti2@gmail.com";

export const CATEGORIES = [
  { id: 'all', name: 'الكل', icon: 'layout-grid' },
  { id: 'medical', name: 'عيادات وصيدليات', icon: 'stethoscope' },
  { id: 'food', name: 'مطاعم وكافيهات', icon: 'utensils' },
  { id: 'maintenance', name: 'صيانة وحرفيين', icon: 'wrench' },
  { id: 'cars', name: 'خدمات سيارات', icon: 'car' },
  { id: 'real_estate', name: 'عقارات وتشطيبات', icon: 'building-2' },
  { id: 'mobiles', name: 'موبايلات', icon: 'smartphone' },
  { id: 'clothing', name: 'ملابس', icon: 'shirt' },
  { id: 'makeup', name: 'ميكب ارتست', icon: 'sparkles' },
  { id: 'cafes', name: 'كافيهات', icon: 'coffee' }
];

export const AREAS = [
  "الشيخ زايد",
  "حي ثالث",
  "السلطان حسين",
  "طريق البلاجات",
  "المحطة الجديدة",
  "التل الكبير",
  "فايد",
  "القنطرة غرب"
];

export const TRANSPORT_ROUTES = [
  { from: "الموقف الجديد", to: "الشيخ زايد", fare: "5.5 جنيه", line: "سرفيس خط 1 / 3", time: "10 دقائق" },
  { from: "الموقف الجديد", to: "السلطان حسين", fare: "6.5 جنيه", line: "سرفيس المحطة", time: "15 دقيقة" },
  { from: "موقف الفردوس", to: "التل الكبير", fare: "18 جنيه", line: "ميكروباص خط التل", time: "40 دقيقة" },
  { from: "موقف الفردوس", to: "فايد", fare: "15 جنيه", line: "ميكروباص خط فايد", time: "30 دقيقة" },
  { from: "موقف الممر", to: "القنطرة غرب", fare: "16 جنيه", line: "ميكروباص القنطرة", time: "35 دقيقة" }
];
