// Конфиг Firebase-проекта. Это НЕ секрет в привычном смысле — Firebase web
// apiKey не даёт доступа сам по себе, разграничение доступа делают Security
// Rules в консоли Firestore, а не сокрытие этого файла. Спокойно коммитится
// в публичный репозиторий.
//
// Проект: Metronom (metronom-a2035), Firestore — australia-southeast1
// (Sydney), Rules — доступ по знанию кода плейлиста (см. план). Настроено
// 2026-09-28.
export const firebaseConfig = {
  apiKey: 'AIzaSyBkQCbd1K08rN26BQf4l59pruccHZ_fts4',
  authDomain: 'metronom-a2035.firebaseapp.com',
  projectId: 'metronom-a2035',
  storageBucket: 'metronom-a2035.firebasestorage.app',
  messagingSenderId: '65328017091',
  appId: '1:65328017091:web:ce9415edc688d458823c76',
}

export const isFirebaseConfigured = firebaseConfig.apiKey !== 'REPLACE_ME'
