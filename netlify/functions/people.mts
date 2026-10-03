import type { Config } from "@netlify/functions";
import { id, json, store, validToken } from "../lib/shared.mts";

type Person = {
  id:string;
  name:string;
  institution?:string;
  description?:string;
  email?:string;
  phone?:string;
  motto?:string;
  websiteUrl?:string;
  facebookUrl?:string;
  instagramUrl?:string;
  linkedinUrl?:string;
  photoKey?:string;
  photoName?:string;
  photoUrl?:string;
  order?:number;
  createdAt?:string;
  updatedAt?:string;
  deleted?:boolean;
};

const defaults: Person[] = [
  {
    "id": "seed-01",
    "name": "ד״ר איבנה רטנר",
    "institution": "האקדמית גורדון / משרד החינוך",
    "description": "מנהלת תחום (מפמ״ר) קולנוע ומדיה באגף אמנויות, משרד החינוך; מרצה ורכזת פדגוגית בחוג להוראת תקשורת ומדיה באקדמית גורדון. עוסקת באוריינות מדיה, אזרחות דיגיטלית, דיאלוג דרך קולנוע ומדיה, חינוך רב־תרבותי ובינה מלאכותית בחינוך; מובילה חשיבה לקראת PISA 2029.",
    "email": "ratnere@gmail.com",
    "phone": "0507156711",
    "order": 1,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-02",
    "name": "ד״ר שרי גנון-שילון",
    "institution": "האקדמית אחוה",
    "description": "תחומי עיסוק מרכזיים: חדשנות טכנולוגית בחינוך, ניהול והובלת בתי ספר, הובלת שינוי ארגוני ופדגוגי ושילוב טכנולוגיה במערכות חינוך.",
    "email": "sherryshilon@gmail.com",
    "phone": "",
    "order": 2,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-03",
    "name": "ד״ר מאירה לוי",
    "institution": "שנקר / מכללת רמת גן",
    "description": "חוקרת ומרצה בתחומי מנהל עסקים, עיצוב ומערכות מידע. תחומי מחקר כוללים חשיבה עיצובית (Design Thinking), Service Design, ניהול ידע, למידה מרחוק והיברידית ורשתות חברתיות; עוסקת גם בחיבורים בין עיצוב, טכנולוגיה והיבטים רפואיים.",
    "email": "levysiis@iac.ac.il",
    "phone": "0545783305",
    "order": 3,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-04",
    "name": "ד״ר עידית פינקלשטיין",
    "institution": "הקריה האקדמית אונו",
    "description": "חוקרת ומרצה בכירה בפקולטה למדעי הרוח והחברה ומנהלת התואר השני בייעוץ ארגוני למוסדות חינוך ולארגונים עסקיים. מחקריה עוסקים בייעוץ בארגונים רב־תרבותיים, ניהול ופיתוח משאבי אנוש, משפט־חינוך־רגולציה, וכן בלמידה והוראה בזמני משבר.",
    "email": "idit.f@ono.ac.il",
    "phone": "0524083099",
    "order": 4,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-05",
    "name": "ציפי בוכניק",
    "institution": "מוסד שמואל נאמן",
    "description": "חוקרת במוסד שמואל נאמן. עוסקת בהון אנושי במדע, טכנולוגיה וחדשנות, מדדים וכוח אדם מדעי־טכנולוגי, זיהוי תחומי ידע מפציעים וטכנולוגיות Deep Tech, מחקרי מדיניות וחינוך; עוסקת גם בסוגיות של חרם אקדמי וחינוך בחירום.",
    "email": "zipibu@sni.technion.ac.il",
    "phone": "0523469609",
    "order": 5,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-06",
    "name": "ד״ר שושי רייטר",
    "institution": "הקריה האקדמית אונו / מרכז רייטר",
    "description": "יועצת ארגונית, חוקרת ומפתחת תוכניות פדגוגיות; מומחית בינלאומית לתיאוריית האילוצים (TOC). עוסקת בוויסות עצמי בלמידה, מנהיגות יזמית, חדשנות ועתידנות פדגוגית וארגונית, Well-being, תהליכי חזון, מיקוד במטרות הארגון, זרימה וצמיחה מתמשכת.",
    "email": "srllead102@gmail.com",
    "phone": "054-4795550",
    "order": 6,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-07",
    "name": "חגית אוחנה",
    "institution": "עמותת מחשבה טובה",
    "description": "מנהלת מחלקת תוכן והדרכה בעמותת מחשבה טובה. עוסקת בפיתוח תוכן, הדרכה וחינוך טכנולוגי, בצמצום פערים חברתיים באמצעות נגישות לטכנולוגיה, ובשימוש בכלים טכנולוגיים לחיזוק מסוגלות, רווחה וחוסן בתקופות שגרה וחירום.",
    "email": "contents@mtova.org.il",
    "phone": "052-7492184",
    "order": 7,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-08",
    "name": "עוודה גנאים חוסין",
    "institution": "הקריה האקדמית אונו",
    "description": "עובדת סוציאלית ומרצה בקריה האקדמית אונו. מלווה צוותים חינוכיים בהתערבויות בחירום ועוסקת בילדים ונוער בסיכון, שיטות התערבות, מוגנות, חוסן ובריאות נפשית במציאות משתנה. עוסקת בחוסן בזמן מלחמה ובחברה הערבית, ובקשרים בין הקשר חברתי, טיפולי ופוליטי; עבודת הדוקטורט מתמקדת בחוסן בקרב אנשי טיפול, בדגש על החברה הערבית. קשורה גם לפעילות עמותת משאבים.",
    "email": "awda.al@lgmail.com",
    "phone": "0503955440",
    "order": 8,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-09",
    "name": "ד״ר ריטה סבר",
    "institution": "האוניברסיטה העברית / מתפקדים לחינוך",
    "description": "חוקרת בכירה במכון לחקר הטיפוח בחינוך ומרצה בכירה בגמלאות בבית הספר לחינוך, האוניברסיטה העברית. מומחית לפסיכולוגיה חברתית־קוגניטיבית, מחקרי הערכה, ריבוי תרבויות, הגירה, קליטת עלייה, פער דיגיטלי וקבוצות מודרות. יו״ר עמותת מתפקדים לחינוך ומעוניינת בשיתופי פעולה סביב חוסן בחירום דרך יכולות שנבנות בשגרה.",
    "email": "ritasever9@gmail.com",
    "phone": "",
    "order": 9,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-10",
    "name": "פרופ׳ אבי ברמן",
    "institution": "פרופ׳ אמריטוס, הטכניון",
    "description": "פרופ׳ אמריטוס בפקולטה למתמטיקה בטכניון. תחומי המחקר המרכזיים: תורת מטריצות וחינוך מתמטי, לרבות פירוקי מטריצות וכלים מתמטיים שהם חלק מהבסיס לחישוב ול-AI. בקהילה עוסק גם במשמעות החינוכית והחוסנית של עבודה לצד מערכות AI וביכולת להתמודד עם מצב שבו מערכת אחרת פותרת בעיה טוב מאיתנו.",
    "email": "berman@technion.ac.il",
    "phone": "0584255994",
    "order": 10,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-11",
    "name": "ד״ר אוהד זיוון",
    "institution": "אוניברסיטת בולוניה",
    "description": "מלמד וחוקר באוניברסיטת בולוניה בתחומי כימיה והנדסת סביבה. עוסק בין היתר בכימיה סביבתית, זיהום אוויר ומים, מיקרופלסטיק ו-PFAS. בקהילה מביא זווית ביקורתית למחקר AI: אינו נשען על AI ככלי עבודה מרכזי אך חוקר ומנתח בעיות הקשורות בו.",
    "email": "ohad.zivan@gmail.com",
    "phone": "+39 3703327330",
    "order": 11,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-12",
    "name": "ד״ר יעל שדה",
    "institution": "אוניברסיטת אריאל",
    "description": "עוסקת בחוסן קהילתי, יזמות וחדשנות בחינוך, חשיבה מערכתית ופיתוח מערכות AI וסימולציות ללמידה. תחומי פעילות כוללים מיפוי חוסן קהילתי בכיתה ובבית הספר, סדנאות חוסן חברתי־קהילתי, ליווי יוזמות חינוכיות ופיתוח סביבות אימון מבוססות סימולציה ו-AI.",
    "email": "Yael.sade@gmail.com",
    "phone": "052-3969417",
    "order": 12,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-13",
    "name": "ד״ר אמל עאמר",
    "institution": "המכללה האקדמית הערבית לחינוך בחיפה / הקריה האקדמית אונו",
    "description": "חוקר ומרצה בתחומי מדיניות חינוך ומנהיגות בית־ספרית, בעל רקע במשפטים ובגישור וניסיון בהוראה, הדרכה וניהול במערכת החינוך. עוסק במדיניות חינוך, מנהיגות, שילוב קבוצות שונות במערכת החינוך והקשר שבין מדיניות, ניהול וחברה; בעבר פעל גם במסגרת בר־אילן.",
    "email": "Amlamer10@gmail.com",
    "phone": "050-3077000",
    "order": 13,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-14",
    "name": "ד״ר עינת שושן-רפאלי",
    "institution": "מוסד שמואל נאמן / מכללת אורנים",
    "description": "עמיתת מחקר בכירה במוסד שמואל נאמן ומרצה במכללת אורנים. עוסקת בפיתוח תוכניות חינוכיות ופדגוגיות, בחקר החוסן של צוותים חינוכיים בשגרה ובמשבר, ברציפות חינוכית ובחינוך בחירום; מרכזת את פעילות פורום חינוך בחירום במוסד נאמן. עוסקת גם בהיערכות מערכת החינוך לשיבושים שלא הוכנה אליהם מראש — מגפה, מלחמה ובינה מלאכותית — ובהשפעת AI על מקצוע ההוראה והמערכת.",
    "email": "ei0509000408@gmail.com",
    "phone": "",
    "order": 14,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-15",
    "name": "ד״ר אילה צדוק",
    "institution": "האוניברסיטה העברית בירושלים",
    "description": "חוקרת מדיניות חינוך ופוסט־דוקטורנטית באוניברסיטה העברית. עוסקת בהשפעות חברתיות על המוטיבציה ללמוד וללמד ובהשפעת AI על תהליכים אלה. בעלת רקע במשרד החינוך בהוראת מדעים, ניהלה שני בתי ספר ופעלה באגף החדשנות במשרד החינוך.",
    "email": "ayala.zadok@mail.huji.ac.il",
    "phone": "054-2488012",
    "order": 15,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  },
  {
    "id": "seed-16",
    "name": "פרופ׳ אורית חזן",
    "institution": "הטכניון / מוסד שמואל נאמן",
    "description": "פרופ׳ בטכניון וחוקרת חינוך, עם עיסוק בחינוך למדעי המחשב ובהכשרת מורים, בינה מלאכותית בחינוך, חוסן, חינוך בחירום ורציפות חינוכית. שותפה לפורום חינוך בחירום ולמחקרים ופרסומים על שימוש בבינה מלאכותית גנרטיבית לתמיכה במערכת החינוך במצבי חירום.",
    "email": "oritha@technion.ac.il",
    "phone": "0547583742",
    "order": 16,
    "createdAt": "2026-09-27T00:00:00.000Z",
    "updatedAt": "2026-09-27T00:00:00.000Z"
  }
];

const dataStore = () => store("hosen-data");

// כתובות שנוספו אחרי שהכרטיס כבר נשמר במסך הניהול: ממלאות רק שדה מייל ריק.
const EMAIL_BACKFILL: Record<string,string> = {
  "seed-02": "sherryshilon@gmail.com",
  "seed-13": "Amlamer10@gmail.com",
};

function cleanUrl(v:any): string {
  const raw=String(v||"").trim();
  if(!raw) return "";
  const candidate=/^https?:\/\//i.test(raw)?raw:`https://${raw}`;
  try{
    const u=new URL(candidate);
    return (u.protocol==="http:"||u.protocol==="https:") ? u.toString().slice(0,700) : "";
  }catch{
    return "";
  }
}

function clean(body:any, base:Partial<Person> = {}): Person {
  const rawOrder = body.order;
  const fallbackOrder = Number(base.order || Date.now());
  const parsedOrder = rawOrder===undefined || rawOrder===null || rawOrder==="" ? fallbackOrder : Number(rawOrder);
  const normalizedOrder = Number.isFinite(parsedOrder) ? Math.max(1,Math.trunc(parsedOrder)) : fallbackOrder;
  return {
    ...base,
    id:String(body.id || base.id || id()),
    name:String(body.name || "").trim().slice(0,160),
    institution:String(body.institution || "").trim().slice(0,220),
    description:String(body.description || "").trim().slice(0,6000),
    email:String(body.email || "").trim().slice(0,240),
    phone:String(body.phone || "").trim().slice(0,80),
    motto:String(body.motto || "").trim().slice(0,600),
    websiteUrl:body.websiteUrl===undefined ? String(base.websiteUrl || "") : cleanUrl(body.websiteUrl),
    facebookUrl:body.facebookUrl===undefined ? String(base.facebookUrl || "") : cleanUrl(body.facebookUrl),
    instagramUrl:body.instagramUrl===undefined ? String(base.instagramUrl || "") : cleanUrl(body.instagramUrl),
    linkedinUrl:body.linkedinUrl===undefined ? String(base.linkedinUrl || "") : cleanUrl(body.linkedinUrl),
    photoKey:body.photoKey===undefined ? String(base.photoKey || "") : (String(body.photoKey || "").startsWith("files/") ? String(body.photoKey) : ""),
    photoName:body.photoName===undefined ? String(base.photoName || "") : String(body.photoName || "").trim().slice(0,240),
    order:normalizedOrder,
    createdAt:String(base.createdAt || body.createdAt || new Date().toISOString()),
    updatedAt:new Date().toISOString(),
    deleted:body.deleted === true
  };
}

async function listAll(): Promise<Person[]> {
  const st=dataStore();
  const map=new Map<string,Person>(defaults.map(x=>[x.id,{...x}]));
  const { blobs }=await st.list({prefix:"people/"});
  for(const b of blobs){
    const v=await st.get(b.key,{type:"json"}) as Person | null;
    if(!v?.id) continue;
    if(v.deleted) map.delete(v.id); else map.set(v.id,{...v,email:String(v.email||"").trim()||EMAIL_BACKFILL[v.id]||""});
  }
  return [...map.values()]
    .filter(x=>!x.deleted)
    .sort((a,b)=>(a.order||0)-(b.order||0) || a.name.localeCompare(b.name,"he"))
    .map(x=>({...x,photoUrl:x.photoKey?`/api/file?key=${encodeURIComponent(x.photoKey)}`:""}));
}

async function placeAt(person:Person, desired:number): Promise<Person> {
  const st=dataStore();
  const others=(await listAll()).filter(x=>x.id!==person.id);
  const position=Math.min(Math.max(1,Math.trunc(desired||1)),others.length+1);
  const arranged=[...others];
  arranged.splice(position-1,0,{...person,order:position});
  for(let i=0;i<arranged.length;i++){
    const { photoUrl, ...stored } = arranged[i] as Person;
    const normalized={...stored,order:i+1,updatedAt:arranged[i].id===person.id?person.updatedAt:stored.updatedAt};
    await st.setJSON(`people/${normalized.id}.json`,normalized);
  }
  return {...person,order:position,photoUrl:person.photoKey?`/api/file?key=${encodeURIComponent(person.photoKey)}`:""};
}

async function resequence(): Promise<void> {
  const st=dataStore();
  const rows=await listAll();
  for(let i=0;i<rows.length;i++){
    const { photoUrl, ...stored } = rows[i] as Person;
    await st.setJSON(`people/${stored.id}.json`,{...stored,order:i+1});
  }
}

export default async (req:Request)=>{
  const st=dataStore();
  if(req.method==="GET"){
    const u=new URL(req.url);
    if(u.searchParams.get("admin")==="1" && !(await validToken(req,"admin"))) return json({error:"unauthorized"},401);
    return json(await listAll());
  }

  if(req.method==="POST"){
    const adminOK=await validToken(req,"admin");
    const uploaderOK=adminOK || await validToken(req,"uploader");
    if(!uploaderOK) return json({error:"unauthorized"},401);
    const body=await req.json();
    const now=new Date().toISOString();
    const current=await listAll();
    const maxOrder=current.reduce((m,x)=>Math.max(m,Number(x.order||0)),0);
    const requestedOrder=adminOK && !(body.order===undefined || body.order===null || body.order==="") ? body.order : maxOrder+1;
    const x=clean({...body,id:id(),order:requestedOrder,createdAt:now},{createdAt:now,order:maxOrder+1});
    if(!x.name) return json({error:"missing_name"},400);
    const placed=await placeAt(x,x.order||maxOrder+1);
    return json(placed,201);
  }

  if(req.method==="PUT"){
    if(!(await validToken(req,"admin"))) return json({error:"unauthorized"},401);
    const body=await req.json();
    if(!body.id) return json({error:"missing_id"},400);
    const key=`people/${body.id}.json`;
    const saved=await st.get(key,{type:"json"}) as Person | null;
    const fallback=defaults.find(x=>x.id===body.id);
    const old=saved || fallback;
    if(!old) return json({error:"not_found"},404);
    const x=clean(body,old);
    if(!x.name) return json({error:"missing_name"},400);
    const placed=await placeAt(x,x.order||old.order||1);
    if(old.photoKey && old.photoKey!==x.photoKey){
      try{ await store("hosen-files").delete(old.photoKey); }catch{}
    }
    return json(placed);
  }

  if(req.method==="DELETE"){
    if(!(await validToken(req,"admin"))) return json({error:"unauthorized"},401);
    const body=await req.json();
    if(!body.id) return json({error:"missing_id"},400);
    const saved=await st.get(`people/${body.id}.json`,{type:"json"}) as Person | null;
    const fallback=defaults.find(x=>x.id===body.id);
    const old=saved || fallback;
    if(!old) return json({error:"not_found"},404);
    await st.setJSON(`people/${body.id}.json`,{...old,deleted:true,updatedAt:new Date().toISOString()});
    if(old.photoKey){
      try{ await store("hosen-files").delete(old.photoKey); }catch{}
    }
    await resequence();
    return json({ok:true});
  }

  return json({error:"method"},405);
};

export const config: Config = { path:"/api/people" };
