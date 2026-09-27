// Конфиг Firebase-проекта. Это НЕ секрет в привычном смысле — Firebase web
// apiKey не даёт доступа сам по себе, разграничение доступа делают Security
// Rules в консоли Firestore, а не сокрытие этого файла. Спокойно коммитится
// в публичный репозиторий.
//
// ЧТО СДЕЛАТЬ ПЕРЕД ПЕРВЫМ ЗАПУСКОМ (единственный шаг, который нельзя
// сделать за вас — требует входа в ваш Google-аккаунт):
//   1. https://console.firebase.google.com → Add project → Metronom
//   2. Build → Firestore Database → Create database (production mode)
//   3. Firestore → Rules — вставить:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /playlists/{code} {
//              allow read, write: if true;
//            }
//          }
//        }
//      (доступ даёт знание кода документа — как ссылка на Google Doc;
//      ужесточить позже, если понадобится.)
//   4. Project settings → General → Your apps → Web app (</>) → скопировать
//      объект конфига сюда вместо заглушки ниже.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
}

export const isFirebaseConfigured = firebaseConfig.apiKey !== 'REPLACE_ME'
