// Perfis de carga alinhados ao plano E2E
// [AUDIT] Thresholds revisados:
//   - double_booking_count  -> Counter -> 'count==0'   OK
//   - ghost_write_count     -> Counter -> 'count==0'   OK (precisa seed em setup, ver metrics.js)
//   - agenda_conflict_correct_rate -> Rate -> 'rate==1.0' / 'rate>0.995'  OK
//   - http_req_failed       -> Rate -> 'rate<...'      OK
//   - http_req_duration     -> Trend -> 'p(95)<...'    OK
export const LEVELS = {
  N1: {
    vus: 5,
    rampUp: '30s',
    steady: '3m',
    rampDown: '30s',
    hotSlots: 3,
    thresholds: {
      'http_req_duration{endpoint:agenda_post}': ['p(95)<500'],
      'http_req_failed': ['rate<0.005'],
      'double_booking_count': ['count==0'],
      'ghost_write_count': ['count==0'],
      'agenda_conflict_correct_rate': ['rate==1.0'],
    },
  },
  N2: {
    vus: 20,
    rampUp: '1m',
    steady: '10m',
    rampDown: '1m',
    hotSlots: 10,
    thresholds: {
      'http_req_duration{endpoint:agenda_post}': ['p(95)<900'],
      'http_req_failed': ['rate<0.01'],
      'double_booking_count': ['count==0'],
      'ghost_write_count': ['count==0'],
      'agenda_conflict_correct_rate': ['rate==1.0'],
    },
  },
  N3: {
    vus: 100,
    rampUp: '2m',
    steady: '15m',
    rampDown: '2m',
    hotSlots: 20,
    thresholds: {
      'http_req_duration{endpoint:agenda_post}': ['p(95)<2000'],
      'http_req_failed': ['rate<0.02'],
      'double_booking_count': ['count==0'],
      'ghost_write_count': ['count==0'],
      'agenda_conflict_correct_rate': ['rate>0.995'],
    },
  },
};
