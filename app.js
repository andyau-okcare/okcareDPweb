const { createApp, ref, computed, onMounted, onBeforeUnmount } = Vue;

const serviceAgreementRows = [
    { key: 'fullDayCentre', label: '全時間日間中心服務（每週6天）', unit: '節數', matches: /全時間.*日間中心|全日.*日間中心|full[- ]?time day cent|full[- ]?day cent/i },
    { key: 'dayCentre', label: '日間中心服務', unit: '節數', matches: /日間中心|day cent(?:re|er)/i },
    { key: 'outsideCentreCare', label: '中心服務時間以外的照顧服務', unit: '小時', matches: /中心服務時間以外|中心.*時間以外|outside.*cent(?:re|er).*care/i },
    { key: 'vehicleTransport', label: '車輛接送', unit: '次數', matches: /車輛接送|車輛|vehicle transport|transport vehicle/i },
    { key: 'escortTransport', label: '陪同接送服務（往返家居／車輛）', unit: '次數', matches: /陪同接送|escort.*transport/i },
    { key: 'homeRehabProfessional', label: '到戶復康運動（物理治療師／職業治療師提供）', unit: '小時', matches: /到戶復康|物理治療|職業治療|physio|occupational therap|(?:^|\W)(?:PT|OT)(?:$|\W)/i },
    { key: 'homeRehabAssistant', label: '到戶復康運動（輔助人員提供）', unit: '小時', matches: /復康.*輔助|rehab.*assistant|(?:^|\W)(?:PTA|OTA)(?:$|\W)/i },
    { key: 'homeNursingProfessional', label: '到戶護理服務（登記護士／註冊護士提供）', unit: '小時', matches: /到戶護理|登記護士|註冊護士|nurs(?:e|ing)|(?:^|\W)(?:RN|EN)(?:$|\W)/i },
    { key: 'homeNursingAssistant', label: '到戶護理服務（輔助人員提供）', unit: '小時', matches: /護理.*輔助|nursing.*assistant/i },
    { key: 'homePersonalCare', label: '到戶個人護理', unit: '小時', matches: /個人護理|personal care|(?:^|\W)HP(?:$|\W)/i },
    { key: 'homeService', label: '家居服務', unit: '小時', matches: /家居服務|家務|home service|household|(?:^|\W)HW(?:$|\W)/i },
    { key: 'escortService', label: '護送服務', unit: '小時', matches: /護送服務|escort service/i },
    { key: 'mealService', label: '膳食服務', unit: '餐數', matches: /膳食|送餐|meal|food service/i },
    { key: 'residentialRespite', label: '住宿暫託服務', unit: '日數', matches: /住宿暫託|residential respite/i },
    { key: 'homeCareProfessional', label: '到戶看顧（專業人員提供）', unit: '小時', matches: /到戶看顧.*專業|home care.*professional/i },
    { key: 'homeCareAssistant', label: '到戶看顧（輔助人員提供）', unit: '小時', matches: /到戶看顧.*輔助|home care.*assistant|(?:^|\W)PCW(?:$|\W)/i },
    { key: 'caregiverTrainingProfessional', label: '到戶照顧者培訓（專業人員提供）', unit: '小時', matches: /照顧者培訓.*專業|caregiver training.*professional/i },
    { key: 'caregiverTrainingAssistant', label: '到戶照顧者培訓（輔助人員提供）', unit: '小時', matches: /照顧者培訓.*輔助|caregiver training.*assistant/i },
    { key: 'homeSafety', label: '家居環境安全評估及改善服務（物理治療師／職業治療師提供）', unit: '小時', matches: /家居環境安全|環境安全評估|home safety|home environment/i },
    { key: 'afterHoursProfessionalCare', label: '服務時間以外的到戶照顧（專業人員）', unit: '小時', matches: /服務時間以外.*到戶照顧.*專業|after[- ]hours.*home care.*professional/i },
    { key: 'afterHoursAssistantCare', label: '服務時間以外的到戶照顧（輔助人員）', unit: '小時', matches: /服務時間以外.*到戶照顧.*輔助|after[- ]hours.*home care.*assistant/i },
    { key: 'speechTherapy', label: '言語治療服務（每節50分鐘）', unit: '節數', matches: /言語治療|speech therap|(?:^|\W)ST(?:$|\W)/i },
    { key: 'afterHoursSpeechTherapy', label: '服務時間以外的言語治療服務（每節50分鐘）', unit: '節數', matches: /服務時間以外.*言語治療|after[- ]hours.*speech therap/i },
    { key: 'mealAddOn', label: '膳食（附加於日間中心服務／膳食服務）', unit: '餐數', matches: /附加.*膳食|meal.*add[- ]?on/i },
    { key: 'assistiveProductRental', label: '租賃輔助產品', unit: '件數', matches: /租賃輔助產品|輔助產品租賃|assistive product rental/i }
];
const serviceAgreementMatchPriority = [
    'afterHoursSpeechTherapy', 'afterHoursProfessionalCare', 'afterHoursAssistantCare',
    'fullDayCentre', 'dayCentre', 'outsideCentreCare', 'escortTransport', 'vehicleTransport',
    'homeSafety', 'homeRehabAssistant', 'homeRehabProfessional', 'homeNursingAssistant', 'homeNursingProfessional',
    'homePersonalCare', 'homeService', 'escortService', 'residentialRespite', 'homeCareProfessional',
    'homeCareAssistant', 'caregiverTrainingProfessional', 'caregiverTrainingAssistant',
    'mealAddOn', 'mealService', 'speechTherapy', 'assistiveProductRental'
];
const serviceAgreementCopayRates = {
    'Cat I': 0.05,
    'Cat II': 0.08,
    'Cat III': 0.12,
    'Cat IV': 0.16,
    'Cat V': 0.25,
    'Cat VI': 0.40
};
const bookingColorOptions = [
    { value: '#DBEAFE', label: '藍色' },
    { value: '#DCFCE7', label: '綠色' },
    { value: '#FEF3C7', label: '黃色' },
    { value: '#FCE7F3', label: '粉紅色' },
    { value: '#EDE9FE', label: '紫色' },
    { value: '#CFFAFE', label: '青色' },
    { value: '#FEE2E2', label: '紅色' },
    { value: '#E2E8F0', label: '灰色' }
];
const serviceColorStorageKey = 'ccsv-calendar-service-colors';

const readStoredServiceColors = () => {
    const storedColors = window.localStorage.getItem(serviceColorStorageKey);
    if (!storedColors) return {};
    const colors = JSON.parse(storedColors);
    if (!colors || typeof colors !== 'object' || Array.isArray(colors)) {
        throw new Error('Saved calendar colors are invalid. Clear the browser calendar color data and choose colors again.');
    }
    return Object.fromEntries(Object.entries(colors).filter(([, color]) =>
        typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)
    ));
};

const defaultBasicSettings = () => ({
    normalStart: '09:00',
    normalEnd: '18:00',
    services: [
        { code: 'PT', name: 'PT', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'OT', name: 'OT', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'ST', name: 'ST', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'RN', name: 'RN', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'EN', name: 'EN', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'PTA', name: 'PTA', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'OTA', name: 'OTA', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'PCW', name: 'PCW', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'HW', name: 'HW', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'HP', name: 'HP', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false }
    ],
    caregivers: [],
    mealCaregivers: [],
    holidays: []
});

const defaultDurationFees = () => Array.from({ length: 14 }, (_, index) => ({
    hours: index + 1,
    serviceFee: 0,
    caregiverFee: 0
}));

const isDurationPricedService = service => ['PCW', 'HW'].includes(String(service && service.code || '').toUpperCase());
const ensureDurationFees = service => {
    if (!isDurationPricedService(service)) return;
    const currentFees = Array.isArray(service.durationFees) ? service.durationFees : [];
    service.durationFees = defaultDurationFees().map(defaultTier => {
        const savedTier = currentFees.find(tier => Number(tier.hours) === defaultTier.hours);
        return savedTier ? {
            hours: defaultTier.hours,
            serviceFee: Number(savedTier.serviceFee) || 0,
            caregiverFee: Number(savedTier.caregiverFee) || 0
        } : defaultTier;
    });
};

const formatLocalDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDaysToDate = (date, days) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const lastDayOfMonth = (date) => {
    const [year, month] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

const readPicFilter = (key, allowedValues) => {
    try {
        const value = window.localStorage.getItem(key);
        return allowedValues.includes(value) ? value : 'ALL';
    } catch (error) {
        console.warn('Could not read this browser profile’s PIC filter preference:', error);
        return 'ALL';
    }
};

const emptyBooking = () => ({
    clientId: '',
    date: formatLocalDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    serviceType: 'PT',
    providerType: 'PT',
    caregiverCode: '',
    caregiverName: '',
    remarks: '',
    includesMeal: false,
    mealCount: 1,
    softMeal: false,
    repeatFrequency: 'none',
    repeatUntil: ''
});

export function initApp() {
    createApp({
        setup() {
            const apiHost = window.location.hostname || 'localhost';
            const apiProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
            const apiBaseUrl = `${apiProtocol}//${apiHost}:3000`;
            const allClients = ref([]);
            const allBookings = ref([]);
            const serviceColors = ref({});
            const bookingColorError = ref('');
            const openBookingColorPicker = ref('');
            const selectedClient = ref(null);
            const activePage = ref('info');
            const serviceMonth = ref(formatLocalDate(new Date()).slice(0, 7));
            const monthOptions = computed(() => {
                const now = new Date();
                const options = [];
                for (let monthIndex = 0; monthIndex < 13; monthIndex += 1) {
                    const date = new Date(Date.UTC(now.getFullYear(), monthIndex, 1));
                    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
                    options.push({
                        value,
                        label: new Intl.DateTimeFormat('zh-HK', {
                            year: 'numeric',
                            month: 'long',
                            timeZone: 'UTC'
                        }).format(date)
                    });
                }
                return options;
            });
            const bookingDateMin = `${new Date().getFullYear()}-01-01`;
            const bookingDateMax = `${new Date().getFullYear() + 1}-01-31`;
            const searchQuery = ref('');
            const picOptions = ['ET', 'YC', 'EY', 'VT'];
            const picFilterStorageKey = 'ccsv-directory-pic-filter';
            const picFilter = ref(readPicFilter(picFilterStorageKey, ['ALL', ...picOptions]));
            const isLoadingData = ref(true);
            const dataLoadError = ref('');
            const bookingsLoadError = ref('');
            const bookingNotice = ref('');
            let bookingNoticeTimer = null;
            const reportPrintError = ref('');
            const addBookingModal = ref(false);
            const editingBookingId = ref(null);
            const addClientModal = ref(false);
            const isSavingClient = ref(false);
            const addClientError = ref('');
            const addClientNotice = ref('');
            const bookingError = ref('');
            const isSavingBooking = ref(false);
            const basicError = ref('');
            const basicNotice = ref('');
            const basicKey = ref('');
            const basicPasswordModal = ref(false);
            const basicUnlocked = ref(false);
            const basicUnlocking = ref(false);
            const savingBasic = ref(false);
            const settings = ref(defaultBasicSettings());
            const newClient = ref({});
            const newBooking = ref(emptyBooking());

            const request = async (path, options = {}) => {
                const response = await fetch(`${apiBaseUrl}${path}`, {
                    cache: 'no-store',
                    ...options,
                    headers: {
                        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                        ...(options.headers || {})
                    }
                });
                if (!response.ok) {
                    const text = await response.text();
                    let message = text;
                    try {
                        const data = JSON.parse(text);
                        message = data.error || text;
                    } catch {
                        // Keep the original response body for non-JSON API errors.
                    }
                    throw new Error(`${path} returned HTTP ${response.status}${message ? `: ${message}` : ''}`);
                }
                if (response.status === 204) return null;
                return response.json();
            };

            const clearBookingNotice = () => {
                if (bookingNoticeTimer !== null) {
                    window.clearTimeout(bookingNoticeTimer);
                    bookingNoticeTimer = null;
                }
                bookingNotice.value = '';
            };

            const showBookingNotice = (message) => {
                clearBookingNotice();
                bookingNotice.value = message;
                bookingNoticeTimer = window.setTimeout(() => {
                    bookingNotice.value = '';
                    bookingNoticeTimer = null;
                }, 2500);
            };

            const loadData = async () => {
                isLoadingData.value = true;
                dataLoadError.value = '';
                bookingsLoadError.value = '';
                bookingColorError.value = '';
                try {
                    const clients = await request('/api/clients');
                    allClients.value = Array.isArray(clients) ? clients : [];
                } catch (error) {
                    console.error('Failed to load CCSV clients:', error);
                    dataLoadError.value = `${error.message}. API address: ${apiBaseUrl}`;
                }
                try {
                    const bookings = await request('/api/bookings');
                    allBookings.value = Array.isArray(bookings) ? bookings : [];
                } catch (error) {
                    console.error('Failed to load CCSV bookings:', error);
                    bookingsLoadError.value = error.message;
                }
                try {
                    serviceColors.value = readStoredServiceColors();
                } catch (error) {
                    console.error('Failed to load locally saved booking colors:', error);
                    bookingColorError.value = error.message;
                }
                try {
                    const services = await request('/api/services');
                    if (Array.isArray(services)) {
                        settings.value.services = services.map(service => {
                            const current = settings.value.services.find(item =>
                                item.code === service.code || item.name === service.name
                            );
                            return {
                                ...service,
                                serviceFee: service.serviceFee === undefined || service.serviceFee === null
                                    ? undefined
                                    : Number(service.serviceFee),
                                caregiverFee: current ? current.caregiverFee : 0,
                                durationFees: Array.isArray(service.durationFees) && service.durationFees.length
                                    ? service.durationFees
                                    : isDurationPricedService(service) ? defaultDurationFees() : []
                            };
                        });
                        if (!services.some(service => service.name === newBooking.value.serviceType)) {
                            newBooking.value.serviceType = services[0]?.name || '';
                            newBooking.value.includesMeal = Boolean(services[0]?.mealIncluded);
                        }
                    }
                } catch (error) {
                    console.error('Failed to load configured service options:', error);
                } finally {
                    isLoadingData.value = false;
                }
                try {
                    const holidays = await request('/api/calendar-holidays');
                    if (!Array.isArray(holidays) || !holidays.every(holiday =>
                        typeof holiday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(holiday)
                    )) {
                        throw new Error('Calendar holidays response has an invalid format.');
                    }
                    settings.value.holidays = holidays;
                } catch (error) {
                    console.error('Failed to load configured calendar holidays:', error);
                }
            };

            const monthBookings = computed(() => allBookings.value.filter(booking =>
                selectedClient.value &&
                String(booking.clientId) === String(selectedClient.value.id) &&
                String(booking.startTime || '').slice(0, 7) === serviceMonth.value
            ));

            const sortedMonthBookings = computed(() => [...monthBookings.value].sort((a, b) =>
                String(a.startTime).localeCompare(String(b.startTime))
            ));

            const serviceIdentityForBooking = booking => {
                const service = serviceConfigForBooking(booking);
                return {
                    code: String(booking.serviceTypeId || (service ? service.code : booking.serviceType) || '').trim().toUpperCase(),
                    type: String(service ? service.name : booking.serviceType || '').trim()
                };
            };

            const serviceConfigForBooking = booking => settings.value.services.find(item =>
                String(item.code || '').toUpperCase() === String(booking.serviceTypeId || '').toUpperCase() ||
                String(item.name || '').toLowerCase() === String(booking.serviceType || '').toLowerCase()
            );

            const serviceColorKeyForBooking = booking => {
                const identity = serviceIdentityForBooking(booking);
                const caregiverId = String(booking.caregiverId || booking.caregiverCode || '').trim().toUpperCase();
                const caregiverKey = caregiverId || `booking:${booking.id}`;
                return `${identity.code}\u0000${identity.type.toLowerCase()}\u0000${caregiverKey}`;
            };

            const bookingColor = booking => serviceColors.value[serviceColorKeyForBooking(booking)] || '#DBEAFE';

            const bookingColorPickerKey = booking => String(booking.id);

            const openBookingColorPickerFor = booking => {
                openBookingColorPicker.value = bookingColorPickerKey(booking);
            };

            const closeBookingColorPicker = () => {
                openBookingColorPicker.value = '';
            };

            const bookingColorPickerOpen = booking =>
                openBookingColorPicker.value === bookingColorPickerKey(booking);

            const saveServiceColor = (booking, color) => {
                const identity = serviceIdentityForBooking(booking);
                if (!identity.code || !identity.type) {
                    bookingColorError.value = '此預約沒有服務類型／服務編碼，無法設定顏色。';
                    return;
                }
                const serviceColorKey = serviceColorKeyForBooking(booking);
                const optimisticColors = {
                    ...serviceColors.value,
                    [serviceColorKey]: color
                };
                serviceColors.value = optimisticColors;
                bookingColorError.value = '';
                closeBookingColorPicker();
                try {
                    window.localStorage.setItem(serviceColorStorageKey, JSON.stringify(optimisticColors));
                } catch (error) {
                    console.error(`Failed to save calendar color locally for service ${identity.code} (${identity.type}):`, error);
                    bookingColorError.value = '顏色已在目前頁面更新，但無法儲存到此瀏覽器。請確認瀏覽器允許本機儲存。';
                }
            };

            const filteredClients = computed(() => {
                const query = searchQuery.value.trim().toLowerCase();
                return allClients.value.filter(client =>
                    (picFilter.value === 'ALL' || client.pic === picFilter.value) &&
                    (!query ||
                    [client.nameCn, client.nameEn, client.voucherNo, client.patientId, client.hkid, client.district]
                        .some(value => String(value || '').toLowerCase().includes(query)))
                );
            });

            const savePicFilter = () => {
                try {
                    window.localStorage.setItem(picFilterStorageKey, picFilter.value);
                } catch (error) {
                    console.warn('Could not save this browser profile’s PIC filter preference:', error);
                }
            };

            const daysInMonth = computed(() => {
                const [year, month] = serviceMonth.value.split('-').map(Number);
                return new Date(year, month, 0).getDate();
            });

            const calendarDays = computed(() => {
                const [year, month] = serviceMonth.value.split('-').map(Number);
                const firstWeekday = new Date(year, month - 1, 1).getDay();
                return [
                    ...Array(firstWeekday).fill(null),
                    ...Array.from({ length: daysInMonth.value }, (_, index) => index + 1)
                ];
            });

            const isCalendarDayRed = day => {
                const [year, month] = serviceMonth.value.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                const dateText = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                return date.getDay() === 0 || (settings.value.holidays || []).includes(dateText);
            };

            const bookingsForDay = (day, mealOnly = false) => {
                if (!day) return [];
                const date = `${serviceMonth.value}-${String(day).padStart(2, '0')}`;
                return sortedMonthBookings.value.filter(booking =>
                    String(booking.startTime).slice(0, 10) === date &&
                    (!mealOnly || booking.includesMeal || isMealBooking(booking))
                );
            };

            const clientName = (id) => {
                const client = allClients.value.find(item => String(item.id) === String(id));
                return client ? `${client.nameCn || ''}${client.nameEn ? ` (${client.nameEn})` : ''}` : 'Unknown client';
            };

            const serviceName = (booking) => booking.serviceType || 'Unspecified';
            const isMealService = serviceType => /meal|膳食|送餐|food service/i.test(String(serviceType || ''));
            const isMealBooking = booking =>
                isMealService(serviceName(booking)) || isMealService(booking.serviceTypeId);

            const bookingWeekday = booking => {
                const date = String(booking.startTime || '').slice(0, 10);
                return date
                    ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
                    : '—';
            };

            const bookingFinancials = booking => {
                const service = serviceConfigForBooking(booking);
                const totalHours = splitHours(booking).total;
                const serviceFee = serviceFeeForHours(service, totalHours);
                const copayRate = serviceAgreementCopayRates[selectedClient.value && selectedClient.value.copayTier];
                return {
                    serviceFee,
                    copayFee: serviceFee !== null && Number.isFinite(copayRate)
                        ? serviceFee * copayRate
                        : null
                };
            };

            const serviceFeeForHours = (service, hours) => {
                if (!service) return null;
                if (isDurationPricedService(service)) {
                    if (!Number.isFinite(hours) || hours < 1 || hours > 14 ||
                        !Array.isArray(service.durationFees) || service.durationFees.length !== 14) return null;
                    const lowerHours = Math.floor(hours);
                    const upperHours = Math.ceil(hours);
                    const lowerTier = service.durationFees.find(tier => Number(tier.hours) === lowerHours);
                    const upperTier = service.durationFees.find(tier => Number(tier.hours) === upperHours);
                    if (!lowerTier || !upperTier) return null;
                    const lowerFee = Number(lowerTier.serviceFee);
                    const upperFee = Number(upperTier.serviceFee);
                    if (!Number.isFinite(lowerFee) || !Number.isFinite(upperFee) || lowerFee < 0 || upperFee < 0) return null;
                    const fraction = hours - lowerHours;
                    return Math.round((lowerFee + (upperFee - lowerFee) * fraction) * 100) / 100;
                }
                const rate = Number(service.serviceFee);
                return Number.isFinite(rate) && rate >= 0 ? rate * hours : null;
            };

            const splitHours = (booking) => {
                if (isMealBooking(booking)) return { normal: 0, overtime: 0, total: 0 };
                const start = new Date(String(booking.startTime).replace(' ', 'T'));
                const end = new Date(String(booking.endTime).replace(' ', 'T'));
                if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
                    return { normal: 0, overtime: 0, total: 0 };
                }
                let normalMinutes = 0;
                const holidaySet = new Set(settings.value.holidays || []);
                const normalStart = settings.value.normalStart || '09:00';
                const normalEnd = settings.value.normalEnd || '18:00';
                for (let cursor = new Date(start); cursor < end;) {
                    const next = new Date(cursor);
                    next.setMinutes(0, 0, 0);
                    next.setHours(next.getHours() + 1);
                    const segmentEnd = next < end ? next : end;
                    const weekday = cursor.getDay();
                    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
                    const hour = cursor.getHours() + cursor.getMinutes() / 60;
                    const startHour = Number(normalStart.slice(0, 2)) + Number(normalStart.slice(3, 5)) / 60;
                    const endHour = Number(normalEnd.slice(0, 2)) + Number(normalEnd.slice(3, 5)) / 60;
                    if (weekday > 0 && weekday < 6 && !holidaySet.has(date) && hour >= startHour && hour < endHour) {
                        normalMinutes += (segmentEnd - cursor) / 60000;
                    }
                    cursor = segmentEnd;
                }
                const total = (end - start) / 3600000;
                const normal = normalMinutes / 60;
                return { normal, overtime: Math.max(0, total - normal), total };
            };

            const monthlyHours = computed(() => monthBookings.value.reduce((sum, booking) => {
                const split = splitHours(booking);
                sum.normal += split.normal;
                sum.overtime += split.overtime;
                return sum;
            }, { normal: 0, overtime: 0 }));

            const serviceTotals = computed(() => {
                const totals = {};
                for (const booking of monthBookings.value) {
                    const name = serviceName(booking);
                    const hours = splitHours(booking);
                    if (!totals[name]) totals[name] = { name, sessions: 0, normal: 0, overtime: 0, total: 0 };
                    totals[name].sessions += 1;
                    totals[name].normal += hours.normal;
                    totals[name].overtime += hours.overtime;
                    totals[name].total += hours.total;
                }
                return Object.values(totals).sort((a, b) => a.name.localeCompare(b.name));
            });

            const clientTotals = computed(() => {
                const totals = {};
                for (const booking of monthBookings.value) {
                    const id = String(booking.clientId);
                    const hours = splitHours(booking);
                    if (!totals[id]) totals[id] = { clientId: id, name: clientName(id), sessions: 0, normal: 0, overtime: 0, total: 0 };
                    totals[id].sessions += 1;
                    totals[id].normal += hours.normal;
                    totals[id].overtime += hours.overtime;
                    totals[id].total += hours.total;
                }
                return Object.values(totals).sort((a, b) => a.name.localeCompare(b.name));
            });

            const providerTotals = computed(() => {
                const totals = {};
                for (const booking of monthBookings.value) {
                    const provider = booking.caregiverName || booking.providerType || 'Unassigned';
                    const service = serviceName(booking);
                    const key = `${provider}\u0000${service}`;
                    const hours = splitHours(booking);
                    if (!totals[key]) totals[key] = { provider, service, sessions: 0, normal: 0, overtime: 0, total: 0 };
                    totals[key].sessions += 1;
                    totals[key].normal += hours.normal;
                    totals[key].overtime += hours.overtime;
                    totals[key].total += hours.total;
                }
                return Object.values(totals).sort((a, b) =>
                    a.provider.localeCompare(b.provider) || a.service.localeCompare(b.service)
                );
            });

            const serviceAgreementTotals = computed(() => {
                const totals = Object.fromEntries(serviceAgreementRows.map(row => [
                    row.key,
                    { ...row, quantity: 0, amount: 0, sessions: 0 }
                ]));
                const unmatched = new Set();
                const unpriced = new Set();
                let foreignSpeechValue = 0;

                for (const booking of monthBookings.value) {
                    const serviceType = serviceName(booking);
                    const serviceConfig = settings.value.services.find(service =>
                        String(service.name || '').toLowerCase() === serviceType.toLowerCase()
                    );
                    const descriptor = `${serviceConfig ? serviceConfig.code : ''} ${serviceType}`.trim();
                    const matchedKey = serviceAgreementMatchPriority.find(key =>
                        serviceAgreementRows.find(row => row.key === key).matches.test(descriptor)
                    );
                    if (!matchedKey) {
                        unmatched.add(serviceType);
                        continue;
                    }

                    const row = totals[matchedKey];
                    const hours = splitHours(booking).total;
                    const quantity = row.unit === '小時' ? hours : 1;
                    const amount = serviceFeeForHours(serviceConfig, hours);
                    if (amount === null) unpriced.add(serviceType);
                    row.quantity += quantity;
                    row.sessions += 1;
                    row.amount += amount === null ? 0 : amount;
                    if (booking.includesMeal && matchedKey !== 'mealService' && matchedKey !== 'mealAddOn') {
                        totals.mealAddOn.quantity += 1;
                        totals.mealAddOn.sessions += 1;
                    }
                    if (/外語|foreign language/i.test(descriptor) && /言語治療|speech therap/i.test(descriptor)) {
                        foreignSpeechValue += amount === null ? 0 : amount;
                    }
                }

                const rows = serviceAgreementRows.map(row => totals[row.key]);
                const totalServiceValue = rows.reduce((sum, row) => sum + row.amount, 0);
                const serviceValueBeforeForeignSpeech = Math.max(0, totalServiceValue - foreignSpeechValue);
                const voucherValue = Math.min(serviceValueBeforeForeignSpeech, 10824);
                const selfPaidValue = Math.max(0, serviceValueBeforeForeignSpeech - 10824);
                const configuredCopayRate = serviceAgreementCopayRates[selectedClient.value && selectedClient.value.copayTier];
                const copayRate = Number.isFinite(configuredCopayRate) ? configuredCopayRate : 0;
                return {
                    rows,
                    unmatched: [...unmatched].sort(),
                    unpriced: [...unpriced].sort(),
                    invalidCopayTier: !Number.isFinite(configuredCopayRate),
                    totalServiceValue,
                    voucherValue,
                    selfPaidValue,
                    foreignSpeechValue,
                    copayRate,
                    copayRateLabel: `${Math.round(copayRate * 100)}%`,
                    copayAmountA: Math.round(voucherValue * copayRate),
                    copayAmountB: Math.round(foreignSpeechValue * copayRate),
                    totalCopayAmount: Math.round(voucherValue * copayRate) + Math.round(foreignSpeechValue * copayRate)
                };
            });

            const mealBookings = computed(() => monthBookings.value.filter(booking => booking.includesMeal));

            const formatServiceAgreementQuantity = row => row.quantity === 0
                ? '—'
                : row.unit === '小時'
                    ? row.quantity.toFixed(1)
                    : String(Math.round(row.quantity));
            const formatCurrency = value => Number(value).toLocaleString('en-HK', {
                maximumFractionDigits: 0
            });
            const formatBookingCurrency = value => Number(value).toLocaleString('en-HK', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });

            const canRepeatFrequency = (frequency, date) => {
                if (frequency === 'none' || !date) return true;
                return addDaysToDate(date, frequency === 'daily' ? 1 : 7) <= lastDayOfMonth(date);
            };

            const setRepeatFrequency = () => {
                const frequency = newBooking.value.repeatFrequency;
                if (frequency === 'none') {
                    newBooking.value.repeatUntil = '';
                    return;
                }
                if (!canRepeatFrequency(frequency, newBooking.value.date)) {
                    newBooking.value.repeatFrequency = 'none';
                    newBooking.value.repeatUntil = '';
                    return;
                }
                newBooking.value.repeatUntil = addDaysToDate(
                    newBooking.value.date,
                    frequency === 'daily' ? 1 : 7
                );
            };

            const adjustRepeatForDate = () => {
                if (newBooking.value.repeatFrequency !== 'none') setRepeatFrequency();
            };

            const openBooking = (client = null, date = '') => {
                bookingError.value = '';
                clearBookingNotice();
                editingBookingId.value = null;
                if (client) selectedClient.value = client;
                newBooking.value = {
                    clientId: selectedClient.value ? String(selectedClient.value.id) : '',
                    date: date || `${serviceMonth.value}-01`,
                    startTime: '09:00',
                    endTime: '10:00',
                    serviceType: settings.value.services[0]?.name || 'PT',
                    providerType: settings.value.services[0]?.name || 'PT',
                    caregiverCode: '',
                    caregiverName: '',
                    remarks: '',
                    includesMeal: settings.value.services[0]?.mealIncluded || false,
                    mealCount: 1,
                    softMeal: false,
                    repeatFrequency: 'none',
                    repeatUntil: ''
                };
                addBookingModal.value = true;
            };

            const editBooking = (booking) => {
                bookingError.value = '';
                clearBookingNotice();
                editingBookingId.value = booking.id;
                newBooking.value = {
                    clientId: String(booking.clientId),
                    date: String(booking.startTime).slice(0, 10),
                    startTime: isMealBooking(booking) ? '' : String(booking.startTime).slice(11, 16),
                    endTime: isMealBooking(booking) ? '' : String(booking.endTime).slice(11, 16),
                    serviceType: booking.serviceType || settings.value.services[0]?.name || '',
                    providerType: booking.serviceType || '',
                    caregiverCode: booking.caregiverCode || '',
                    caregiverName: (isMealBooking(booking) ? settings.value.mealCaregivers : settings.value.caregivers).find(caregiver =>
                        caregiver.code === (booking.caregiverCode || booking.caregiverId)
                    )?.name || booking.caregiverName || '',
                    remarks: booking.remarks || '',
                    includesMeal: Boolean(booking.includesMeal),
                    mealCount: Number(booking.mealCount) || 1,
                    softMeal: Boolean(booking.softMeal),
                    repeatFrequency: 'none',
                    repeatUntil: ''
                };
                addBookingModal.value = true;
            };

            const selectClient = (client) => {
                selectedClient.value = client;
                activePage.value = 'calendar';
                bookingError.value = '';
            };

            const backToClients = () => {
                selectedClient.value = null;
                activePage.value = 'info';
                bookingError.value = '';
            };

            const applyServiceDefaults = () => {
                const service = settings.value.services.find(item => item.name === newBooking.value.serviceType);
                newBooking.value.providerType = newBooking.value.serviceType;
                if (service) newBooking.value.includesMeal = service.mealIncluded;
                if (isMealService(newBooking.value.serviceType)) {
                    newBooking.value.startTime = '';
                    newBooking.value.endTime = '';
                } else {
                    if (!newBooking.value.startTime) newBooking.value.startTime = '09:00';
                    if (!newBooking.value.endTime) newBooking.value.endTime = '10:00';
                }
                const caregiver = bookingCaregivers().find(item => item.code === newBooking.value.caregiverCode);
                if (isMealService(newBooking.value.serviceType) && !caregiver) {
                    newBooking.value.caregiverCode = '';
                    newBooking.value.caregiverName = '';
                } else if (caregiver) {
                    newBooking.value.caregiverName = caregiver.name;
                }
            };

            const bookingCaregivers = () => isMealService(newBooking.value.serviceType)
                ? settings.value.mealCaregivers
                : settings.value.caregivers;

            const applyCaregiverName = () => {
                const caregiver = bookingCaregivers().find(item =>
                    item.code === newBooking.value.caregiverCode
                );
                if (caregiver) {
                    newBooking.value.caregiverName = caregiver.name;
                } else if (isMealService(newBooking.value.serviceType)) {
                    newBooking.value.caregiverName = '';
                }
            };

            const saveBooking = async () => {
                if (isSavingBooking.value) return;
                bookingError.value = '';
                const mealService = isMealService(newBooking.value.serviceType);
                if (!newBooking.value.caregiverCode.trim() || !newBooking.value.caregiverName.trim()) {
                    bookingError.value = '請輸入照顧者編碼及姓名，才能儲存預約。';
                    return;
                }
                if (!mealService && (!newBooking.value.startTime || !newBooking.value.endTime)) {
                    bookingError.value = '請輸入服務開始及結束時間。';
                    return;
                }
                const wasEditing = editingBookingId.value !== null;
                const dates = [newBooking.value.date];
                if (newBooking.value.repeatFrequency !== 'none') {
                    const monthEnd = lastDayOfMonth(newBooking.value.date);
                    if (!newBooking.value.repeatUntil ||
                        newBooking.value.repeatUntil < newBooking.value.date ||
                        newBooking.value.repeatUntil > monthEnd) {
                        bookingError.value = '重複預約必須在服務日期所在月份內結束。';
                        return;
                    }
                    const increment = newBooking.value.repeatFrequency === 'daily' ? 1 : 7;
                    if (!canRepeatFrequency(newBooking.value.repeatFrequency, newBooking.value.date)) {
                        bookingError.value = '此日期在本月內沒有下一個重複日期，請選擇不重複或更改服務日期。';
                        return;
                    }
                    if (newBooking.value.repeatUntil < addDaysToDate(newBooking.value.date, increment)) {
                        bookingError.value = '重複結束日期必須至少包括下一個重複日期。';
                        return;
                    }
                    for (let nextDate = addDaysToDate(newBooking.value.date, increment);
                        nextDate <= newBooking.value.repeatUntil;
                        nextDate = addDaysToDate(nextDate, increment)) {
                        dates.push(nextDate);
                        if (dates.length > 100) {
                            bookingError.value = '一次最多可建立 100 次預約，請縮短重複日期範圍。';
                            return;
                        }
                    }
                }

                isSavingBooking.value = true;
                const createdBookings = [];
                try {
                    for (const date of dates) {
                        const { repeatFrequency, repeatUntil, ...bookingDetails } = newBooking.value;
                        const booking = {
                            ...bookingDetails,
                            providerType: bookingDetails.serviceType,
                            date,
                            startTime: mealService ? `${date} 00:00:00` : `${date} ${newBooking.value.startTime}:00`,
                            endTime: mealService ? `${date} 00:01:00` : `${date} ${newBooking.value.endTime}:00`
                        };
                        const result = await request(editingBookingId.value
                            ? `/api/bookings/${encodeURIComponent(editingBookingId.value)}`
                            : '/api/bookings', {
                            method: editingBookingId.value ? 'PUT' : 'POST',
                            body: JSON.stringify(booking)
                        });
                        if (wasEditing) {
                            allBookings.value = allBookings.value.map(existing =>
                                String(existing.id) === String(editingBookingId.value) ? result.booking : existing
                            );
                        } else {
                            createdBookings.push(result.booking);
                        }
                    }
                    if (createdBookings.length) allBookings.value.push(...createdBookings);
                    if (wasEditing) serviceMonth.value = newBooking.value.date.slice(0, 7);
                    addBookingModal.value = false;
                    editingBookingId.value = null;
                    showBookingNotice(wasEditing
                        ? '預約已成功更新。'
                        : dates.length === 1
                            ? '預約已成功儲存。'
                            : `已成功建立 ${dates.length} 次重複預約。`);
                } catch (error) {
                    if (wasEditing) {
                        bookingError.value = `更新預約失敗：${error.message}`;
                        return;
                    }
                    const rollbackFailures = new Set();
                    for (const booking of createdBookings) {
                        try {
                            await request(`/api/bookings/${encodeURIComponent(booking.id)}`, { method: 'DELETE' });
                        } catch (rollbackError) {
                            rollbackFailures.add(String(booking.id));
                            console.error(`Failed to roll back repeated booking ${booking.id}:`, rollbackError);
                        }
                    }
                    const remainingBookings = createdBookings.filter(booking => rollbackFailures.has(String(booking.id)));
                    allBookings.value.push(...remainingBookings);
                    bookingError.value = remainingBookings.length
                        ? `建立失敗（${error.message}）。${remainingBookings.length} 項已建立預約未能撤銷，請檢查日曆並手動移除。`
                        : `建立失敗（${error.message}）。已撤銷本次已建立的預約，沒有保留部分重複預約。`;
                } finally {
                    isSavingBooking.value = false;
                }
            };

            const removeBooking = async (booking) => {
                bookingError.value = '';
                try {
                    await request(`/api/bookings/${encodeURIComponent(booking.id)}`, { method: 'DELETE' });
                    allBookings.value = allBookings.value.filter(item => item.id !== booking.id);
                } catch (error) {
                    bookingError.value = error.message;
                }
            };

            const exportPowerAutomateCsv = () => {
                const headers = ['booking_id', 'client_id', 'patient_id', 'voucher_no', 'service_date', 'start_time', 'end_time', 'service_type', 'provider_type', 'caregiver_code', 'caregiver_name', 'normal_hours', 'overtime_hours', 'meal_included', 'meal_count', 'soft_meal', 'remarks', 'power_automate_code'];
                const rows = monthBookings.value.map(booking => {
                    const client = allClients.value.find(item => String(item.id) === String(booking.clientId)) || {};
                    const hours = splitHours(booking);
                    const date = String(booking.startTime).slice(0, 10);
                    return [
                        booking.id, client.clientId || '', client.patientId || '', client.voucherNo || '',
                        date, isMealBooking(booking) ? '' : String(booking.startTime).slice(11, 16),
                        isMealBooking(booking) ? '' : String(booking.endTime).slice(11, 16),
                        serviceName(booking), booking.providerType || '', booking.caregiverCode || '',
                        booking.caregiverName || '', isMealBooking(booking) ? '' : hours.normal.toFixed(2),
                        isMealBooking(booking) ? '' : hours.overtime.toFixed(2),
                        booking.includesMeal ? 1 : 0,
                        isMealBooking(booking) ? booking.mealCount || 1 : '',
                        isMealBooking(booking) ? (booking.softMeal ? 1 : 0) : '',
                        booking.remarks || '',
                        `B-${date.replace(/-/g, '')}-${booking.id}`
                    ];
                });
                const csv = [headers, ...rows].map(row => row.map(value =>
                    `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""')}"`
                ).join(',')).join('\r\n');
                const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `ccsv-powerautomate-${serviceMonth.value}.csv`;
                anchor.click();
                URL.revokeObjectURL(url);
            };

            const loadBasicSettings = async () => {
                basicUnlocking.value = true;
                basicError.value = '';
                basicNotice.value = '';
                try {
                    const data = await request('/api/basic', {
                        headers: { 'X-Basic-Settings-Key': basicKey.value }
                    });
                    settings.value = { ...defaultBasicSettings(), ...data };
                    settings.value.services.forEach(ensureDurationFees);
                    basicUnlocked.value = true;
                    basicPasswordModal.value = false;
                    activePage.value = 'basic';
                } catch (error) {
                    basicUnlocked.value = false;
                    basicError.value = error.message.includes('/api/basic returned HTTP 404')
                        ? '目前連接的 API 伺服器沒有 /api/basic 路由，這不是密碼錯誤。請將最新 ccsv-backend/server.js 部署到 NAS 的 /volume1/web/ccsv-backend/，停止舊的 CCSV API 工作後，只啟動一次 /bin/sh /volume1/web/ccsv-backend/start-api.sh。重啟後直接開啟 http://<NAS-IP>:3000/api/basic；若路由已更新，會回傳 JSON 授權錯誤，而不是「Cannot GET /api/basic」。'
                        : error.message;
                } finally {
                    basicUnlocking.value = false;
                }
            };

            const openBasicPasswordPrompt = () => {
                activePage.value = 'info';
                basicUnlocked.value = false;
                settings.value = defaultBasicSettings();
                basicKey.value = '';
                basicError.value = '';
                basicPasswordModal.value = true;
            };

            const saveBasicSettings = async () => {
                savingBasic.value = true;
                basicError.value = '';
                basicNotice.value = '';
                try {
                    const data = await request('/api/basic', {
                        method: 'PUT',
                        headers: { 'X-Basic-Settings-Key': basicKey.value },
                        body: JSON.stringify(settings.value)
                    });
                    settings.value = { ...defaultBasicSettings(), ...data };
                    settings.value.services.forEach(ensureDurationFees);
                    basicNotice.value = 'Basic 設定已儲存。';
                } catch (error) {
                    basicError.value = error.message;
                } finally {
                    savingBasic.value = false;
                }
            };

            const addService = () => settings.value.services.push({ code: '', name: '', serviceProfessional: '', serviceFee: 0, caregiverFee: 0, mealIncluded: false, durationFees: defaultDurationFees() });
            const removeService = (index) => settings.value.services.splice(index, 1);
            const addCaregiver = () => settings.value.caregivers.push({ code: '', name: '', hourlyFee: 0 });
            const removeCaregiver = (index) => settings.value.caregivers.splice(index, 1);
            const addMealCaregiver = () => settings.value.mealCaregivers.push({ code: '', name: '' });
            const removeMealCaregiver = (index) => settings.value.mealCaregivers.splice(index, 1);
            const addHoliday = () => settings.value.holidays.push('');
            const removeHoliday = (index) => settings.value.holidays.splice(index, 1);

            const openAddClientModal = () => {
                newClient.value = {
                    clientId: '', patientId: '', voucherNo: '', hkid: '', nameCn: '', nameEn: '',
                    copayTier: 'Cat I', pic: picOptions[0], adminClientName: '',
                    district: '', address: '', telephone: ''
                };
                addClientError.value = '';
                addClientNotice.value = '';
                addClientModal.value = true;
            };

            const saveNewClient = async () => {
                isSavingClient.value = true;
                addClientError.value = '';
                try {
                    await request('/api/clients', { method: 'POST', body: JSON.stringify(newClient.value) });
                    addClientModal.value = false;
                    addClientNotice.value = '個案已成功新增。';
                    await loadData();
                } catch (error) {
                    addClientError.value = error.message;
                } finally {
                    isSavingClient.value = false;
                }
            };

            const printReport = () => {
                reportPrintError.value = '';
                if (activePage.value === 'e' || activePage.value === 'f') {
                    if (serviceAgreementTotals.value.unmatched.length) {
                        reportPrintError.value = `以下服務類型無法配對至表格項目，未能列印：${serviceAgreementTotals.value.unmatched.join('、')}。請在 Basic 設定中調整服務名稱後重試。`;
                        return;
                    }
                    if (serviceAgreementTotals.value.unpriced.length) {
                        reportPrintError.value = `以下服務費用尚未載入或未設定有效金額，未能計算付款金額：${serviceAgreementTotals.value.unpriced.join('、')}。請確認 API 已更新並在 service_fees 設定費用後重試。`;
                        return;
                    }
                    if (serviceAgreementTotals.value.invalidCopayTier) {
                        reportPrintError.value = '個案的共同付款級別無效，未能計算付款金額。請先更新個案資料。';
                        return;
                    }
                }
                window.print();
            };

            onMounted(loadData);
            onBeforeUnmount(() => {
                if (bookingNoticeTimer !== null) window.clearTimeout(bookingNoticeTimer);
            });

            return {
                allClients, allBookings, selectedClient, activePage, serviceMonth, searchQuery, picOptions,
                bookingColorError, bookingColorOptions, bookingColor, saveServiceColor,
                openBookingColorPickerFor, closeBookingColorPicker, bookingColorPickerOpen,
                picFilter, savePicFilter, bookingNotice, addBookingModal,
                isLoadingData, dataLoadError, bookingsLoadError, loadData,
                filteredClients, addClientModal, isSavingClient, addClientError, addClientNotice,
                bookingError, isSavingBooking, editingBookingId, basicError, basicNotice, basicKey, basicPasswordModal, basicUnlocked, basicUnlocking, savingBasic, settings, newClient,
                newBooking, monthBookings, sortedMonthBookings, calendarDays, bookingsForDay, isCalendarDayRed,
                clientName, serviceName, isMealService, isMealBooking, monthlyHours, serviceTotals, clientTotals, providerTotals, serviceAgreementTotals,
                reportPrintError, formatServiceAgreementQuantity, formatCurrency, formatBookingCurrency,
                isDurationPricedService, ensureDurationFees,
                bookingWeekday, bookingFinancials, serviceConfigForBooking,
                monthOptions, bookingDateMin, bookingDateMax, mealBookings, openBooking, editBooking, selectClient, backToClients, applyServiceDefaults, applyCaregiverName, saveBooking, removeBooking, exportPowerAutomateCsv,
                canRepeatFrequency, setRepeatFrequency, adjustRepeatForDate,
                loadBasicSettings, openBasicPasswordPrompt, saveBasicSettings, addService, removeService, addCaregiver,
                removeCaregiver, addMealCaregiver, removeMealCaregiver, bookingCaregivers, addHoliday, removeHoliday, openAddClientModal, saveNewClient,
                printReport, splitHours
            };
        }
    }).mount('#app');
}
