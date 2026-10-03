# hosen-hinuch-herum

Repository ייעודי לאתר קהילת חוסן–חינוך–חירום.

- Netlify site: hosen-hinuch-herum
- Production branch: main
- הפרויקט הזה נפרד לחלוטין מ-SBE ומ-HILA.
- אין להעתיק לכאן קוד, נכסים או הגדרות של THEOWLWITCH/SBE או THEOWLWITCH/hila-greenbook.
- Netlify Functions נמצאות תחת netlify/functions.
- הגדרות הפריסה נמצאות ב-netlify.toml.

זהו מקור הקוד היחיד של אתר hosen-hinuch-herum.

<!-- redeploy: restore BOARD_CODE and EDITOR_CODE env vars -->

<!-- redeploy after verified production env vars -->

<!-- deploy academic refinement v37 -->

<!-- preview-academic-v37 -->

## קולות קוראים וקבוצות משימה

- המסך `/calls`: קולות קוראים ממוינים לפי המועד האחרון, התאמה לחוקרות לפי תחומי העיסוק, יומן מנוי (`/api/calls?format=ics`) וזירת קבוצות משימה עם סביבת עבודה משותפת לכתיבת הצעה.
- איסוף אוטומטי: מנהלת המערכת מגדירה מקורות (פידים של Google Alerts או עמודי קולות קוראים) בחלון "ניהול קולות קוראים". `calls-collect` רץ כל בוקר ומעביר פריטים חדשים לתיבת האישור. שום דבר לא מתפרסם בלי אישור.
- מיילים: בלי הגדרה, כל שליחה נפתחת כטיוטה ב-Gmail. לשליחה אוטומטית (חינם, עד 500 ביום) מגדירים ב-Netlify את `GMAIL_USER` ואת `GMAIL_APP_PASSWORD` (סיסמת אפליקציה של Google). אז `calls-digest` שולח גם סיכום שבועי אישי בכל יום ראשון.
- סביבת העבודה של קבוצה נפתחת בקישור סודי (`/calls#team=ID.KEY`). בשרת נשמר רק גיבוב של המפתח.
