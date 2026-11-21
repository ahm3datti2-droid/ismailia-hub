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

// الأقسام الرئيسية (14 قسماً) — كل قسم فيه تصنيفات فرعية.
// الخدمة في Firestore تحمل حقلين: category = معرّف القسم الرئيسي،
// وsubcategory = معرّف التصنيف الفرعي (قد يكون فارغاً للخدمات القديمة).
export const GROUPS = [
  { id: 'food', name: 'الأغذية والمشروبات', icon: 'utensils', subs: [
    { id: 'restaurants', name: 'مطاعم' },
    { id: 'cafes', name: 'كافيهات ومقاهي' },
    { id: 'sweets', name: 'حلويات ومخبوزات' },
    { id: 'supermarkets', name: 'سوبر ماركت وبقالة' },
    { id: 'butchers', name: 'جزارة ودواجن' },
    { id: 'vegetables', name: 'خضار وفاكهة' },
    { id: 'spices', name: 'عطارة وتوابل' },
    { id: 'dairy', name: 'ألبان ومنتجاتها' },
    { id: 'juices', name: 'عصائر ومثلجات' }
  ]},
  { id: 'delivery', name: 'دليفري', icon: 'bike', subs: [
    { id: 'delivery', name: 'توصيل طلبات' }
  ]},
  { id: 'fashion', name: 'الملابس والأزياء', icon: 'shirt', subs: [
    { id: 'clothing', name: 'ملابس' },
    { id: 'mens', name: 'ملابس رجالي' },
    { id: 'womens', name: 'ملابس حريمي' },
    { id: 'kids', name: 'ملابس أطفال' },
    { id: 'sports', name: 'ملابس رياضية' },
    { id: 'shoes', name: 'أحذية وشنط' },
    { id: 'hijab', name: 'عبايات وطرح' },
    { id: 'accessories', name: 'إكسسوارات وساعات ونظارات' },
    { id: 'jewelry', name: 'ذهب ومجوهرات' },
    { id: 'tailoring', name: 'أتيليهات وتفصيل' }
  ]},
  { id: 'health', name: 'الصحة والطب', icon: 'stethoscope', subs: [
    { id: 'hospitals', name: 'مستشفيات ومراكز طبية' },
    { id: 'clinics', name: 'عيادات أطباء' },
    { id: 'pharmacies', name: 'صيدليات' },
    { id: 'labs', name: 'معامل تحاليل' },
    { id: 'radiology', name: 'مراكز أشعة' },
    { id: 'physio', name: 'علاج طبيعي وتأهيل' },
    { id: 'medical-supplies', name: 'مستلزمات طبية' }
  ]},
  { id: 'education', name: 'التعليم والأدوات المكتبية', icon: 'book-open', subs: [
    { id: 'bookstores', name: 'مكتبات وأدوات مدرسية' },
    { id: 'printing', name: 'طباعة وتصوير ودعاية' },
    { id: 'schools', name: 'مدارس وحضانات' },
    { id: 'courses', name: 'كورسات وتدريب' },
    { id: 'tutoring', name: 'سناتر تعليمية' }
  ]},
  { id: 'beauty', name: 'الجمال والعناية الشخصية', icon: 'sparkles', subs: [
    { id: 'makeup-artists', name: 'ميكب ارتست' },
    { id: 'barbers', name: 'حلاقة رجالي' },
    { id: 'salons', name: 'كوافير وبيوتي سنتر' },
    { id: 'cosmetics', name: 'مستحضرات تجميل وعطور' },
    { id: 'gym', name: 'جيم ونوادي رياضية' },
    { id: 'spa', name: 'سبا ومساج وعناية بالبشرة' }
  ]},
  { id: 'home', name: 'المنزل والأثاث والأجهزة', icon: 'sofa', subs: [
    { id: 'furniture', name: 'أثاث وموبيليا ومفروشات' },
    { id: 'appliances', name: 'أجهزة كهربائية ومنزلية' },
    { id: 'houseware', name: 'أدوات منزلية ومطبخ' },
    { id: 'decor', name: 'ديكور ونجف وإضاءة' },
    { id: 'carpets', name: 'سجاد وستائر' },
    { id: 'mattresses', name: 'مراتب' }
  ]},
  { id: 'maintenance', name: 'الصيانة والمقاولات والتشطيبات', icon: 'wrench', subs: [
    { id: 'hardware', name: 'حدايد وبويات ومواد بناء' },
    { id: 'plumbing', name: 'سباكة وأدوات صحية' },
    { id: 'electrical', name: 'كهرباء وإنارة' },
    { id: 'ceramics', name: 'سيراميك وبورسلين ورخام' },
    { id: 'contracting', name: 'مقاولات وتشطيبات وديكور' },
    { id: 'workshops', name: 'ورش نجارة وألوميتال' },
    { id: 'technicians', name: 'فنيين وصنايعية' },
    { id: 'security', name: 'أمن وحراسة وأنظمة مراقبة ومصاعد' }
  ]},
  { id: 'automotive', name: 'السيارات والنقل', icon: 'car', subs: [
    { id: 'showrooms', name: 'معارض سيارات' },
    { id: 'repair', name: 'صيانة سيارات' },
    { id: 'spare-parts', name: 'قطع غيار سيارات' },
    { id: 'tires', name: 'إطارات وبطاريات' },
    { id: 'car-wash', name: 'مغاسل سيارات وعناية' },
    { id: 'rental', name: 'تأجير سيارات' },
    { id: 'fuel', name: 'محطات وقود' }
  ]},
  { id: 'tech', name: 'التكنولوجيا والاتصالات', icon: 'smartphone', subs: [
    { id: 'mobile-shops', name: 'موبايلات وإكسسوارات' },
    { id: 'mobile-repair', name: 'صيانة موبايلات وكمبيوتر' },
    { id: 'computers', name: 'كمبيوتر ولاب توب وكاميرات' },
    { id: 'telecom', name: 'فروع اتصالات ودفع إلكتروني' },
    { id: 'software', name: 'برمجيات وتصميم' }
  ]},
  { id: 'professional', name: 'الخدمات المهنية والمالية', icon: 'briefcase', subs: [
    { id: 'banks', name: 'بنوك وصراف آلي' },
    { id: 'lawyers', name: 'محاماة واستشارات قانونية' },
    { id: 'accounting', name: 'محاسبة ومراجعة ضريبية' },
    { id: 'real-estate', name: 'عقارات' },
    { id: 'travel', name: 'سياحة وسفر وحج وعمرة' },
    { id: 'shipping', name: 'شحن وتوصيل طلبات' }
  ]},
  { id: 'entertainment', name: 'الترفيه والحيوانات الأليفة', icon: 'gamepad-2', subs: [
    { id: 'toy-shops', name: 'محلات لعب أطفال' },
    { id: 'kids-areas', name: 'ملاهي ومناطق ألعاب أطفال' },
    { id: 'playstation', name: 'بلايستيشن وسايبر' },
    { id: 'wedding-halls', name: 'قاعات أفراح ومناسبات' },
    { id: 'flowers', name: 'زهور وهدايا' },
    { id: 'pets', name: 'عيادات بيطرية ومستلزمات حيوانات' },
    { id: 'laundry', name: 'مغاسل ملابس (دراي كلين)' }
  ]},
  { id: 'factories', name: 'مصانع وشركات', icon: 'factory', subs: [
    { id: 'food-industry', name: 'صناعات غذائية' },
    { id: 'industry', name: 'صناعات أخرى' }
  ]},
  { id: 'government', name: 'خدمات حكومية', icon: 'landmark', subs: [
    { id: 'postal', name: 'بريد' },
    { id: 'supply', name: 'تموين' }
  ]}
];

// قائمة مسطحة بالأقسام الرئيسية (مع "الكل" أولاً) — للفلاتر والإحصائيات.
export const CATEGORIES = [
  { id: 'all', name: 'الكل', icon: 'layout-grid' },
  ...GROUPS.map((g) => ({ id: g.id, name: g.name, icon: g.icon }))
];

export function groupInfo(id) {
  return GROUPS.find((g) => g.id === id) || null;
}

export function subcategoryInfo(groupId, subId) {
  const g = groupInfo(groupId);
  return (g && g.subs.find((s) => s.id === subId)) || null;
}

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

// "جارك" — اقتصاد الجيران داخل الدليل (صفحة مستقلة jarak.html).
// ليس قسم خدمات: لا يُضاف إلى GROUPS حتى لا يظهر كتصنيف خدمة
// في الفلاتر ونموذج الأدمن وإحصائيات الأقسام.
export const JARAK_CATEGORIES = [
  { id: 'delivery', name: 'توصيل' },
  { id: 'rides', name: 'مشاوير' },
  { id: 'plumbing', name: 'سباكة' },
  { id: 'electrical', name: 'كهرباء' },
  { id: 'cleaning', name: 'تنظيف' },
  { id: 'errands', name: 'مشاوير ومهام' }
];

export function jarakCategoryName(id) {
  const c = JARAK_CATEGORIES.find((x) => x.id === id);
  return c ? c.name : id;
}

export const TRANSPORT_ROUTES = [
  { from: "الموقف الجديد", to: "الشيخ زايد", fare: "5.5 جنيه", line: "سرفيس خط 1 / 3", time: "10 دقائق" },
  { from: "الموقف الجديد", to: "السلطان حسين", fare: "6.5 جنيه", line: "سرفيس المحطة", time: "15 دقيقة" },
  { from: "موقف الفردوس", to: "التل الكبير", fare: "18 جنيه", line: "ميكروباص خط التل", time: "40 دقيقة" },
  { from: "موقف الفردوس", to: "فايد", fare: "15 جنيه", line: "ميكروباص خط فايد", time: "30 دقيقة" },
  { from: "موقف الممر", to: "القنطرة غرب", fare: "16 جنيه", line: "ميكروباص القنطرة", time: "35 دقيقة" }
];

// أرقام مهمة لو اتعرضت لنصب أو ابتزاز — مركز الوعي الرقمي.
// ملف الإعدادات الوحيد للأرقام دي: عدّل هنا وتتغير في صفحة الوعي.
// tel: null يعني الرقم مش رقم اتصال مباشر (نص يُعرض فقط).
export const AWARENESS_EMERGENCY_NUMBERS = [
  { name: "مباحث الإنترنت (مكافحة جرائم تقنية المعلومات)", number: "108", desc: "خط ساخن بوزارة الداخلية لبلاغات الجرائم الإلكترونية: نصب، ابتزاز، اختراق.", icon: "shield-alert" },
  { name: "خط نجدة الطفل", number: "16000", desc: "المجلس القومي للطفولة والأمومة — لأي خطر على طفل، ومنه الإيذاء أو الابتزاز على الإنترنت.", icon: "baby" },
  { name: "شكاوى المجلس القومي للمرأة", number: "15115", desc: "دعم ومساندة للسيدات، ومنه حالات الابتزاز الإلكتروني.", icon: "heart-handshake" },
  { name: "خدمة عملاء بنكك", number: "الرقم على ضهر الكارت", desc: "لو حصلت معاملة إنت مش عاملها: كلم البنك فورًا من الرقم الرسمي بس واطلب إيقاف الكارت.", icon: "credit-card", tel: null }
];

// أرقام الطوارئ العامة في مصر — تظهر في صفحة الطوارئ (اتصال مباشر).
export const EMERGENCY_NUMBERS = [
  { name: "الإسعاف", number: "123", icon: "ambulance" },
  { name: "الشرطة / النجدة", number: "122", icon: "shield-alert" },
  { name: "المطافئ", number: "180", icon: "flame" },
  { name: "طوارئ الكهرباء", number: "121", icon: "zap" },
  { name: "طوارئ المياه", number: "125", icon: "droplets" },
  { name: "طوارئ الغاز", number: "129", icon: "fuel" }
];
