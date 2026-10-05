const { createApp, ref, computed, onMounted } = Vue;

export function initApp() {
    createApp({
        setup() {
            const apiHost = window.location.hostname || 'localhost';
            const apiProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
            const apiBaseUrl = `${apiProtocol}//${apiHost}:3000`;

            const allClients = ref([]);
            const allBookings = ref([]);
            const selectedClient = ref(null);
            const activeTab = ref('info');
            
            const globalServiceMonth = ref('2026-10');
            const currentPicUser = ref('ET');
            const picOptions = ['ET', 'YC', 'EY', 'VT'];
            
            const searchQuery = ref('');
            const filterPic = ref('ALL');
            const filterStatus = ref('ALL');
            const currentPage = ref(1);
            const pageSize = ref(15);
            
            const addBookingModal = ref(false);
            const bookingMode = ref('single');
            const addClientModal = ref(false);
            const isSavingClient = ref(false);
            const addClientError = ref('');
            const addClientNotice = ref('');
            const newClient = ref({});
            
            const newBooking = ref({
                date: '2026-10-01',
                serviceName: '物理治療 (PT)',
                startTime: '09:00',
                endTime: '10:00',
                providerRole: 'PT',
                providerName: '陳大文'
            });

            // Fetch data from Node.js backend API with safety checks
            const fetchData = async () => {
                try {
                    const clientRes = await fetch(`${apiBaseUrl}/api/clients`);
                    if (!clientRes.ok) {
                        throw new Error(`Client API returned HTTP ${clientRes.status}`);
                    }
                    const clientData = await clientRes.json();
                    allClients.value = Array.isArray(clientData) ? clientData : [];
                    
                    const bookingRes = await fetch(`${apiBaseUrl}/api/bookings`);
                    if (!bookingRes.ok) {
                        throw new Error(`Booking API returned HTTP ${bookingRes.status}`);
                    }
                    const bookingData = await bookingRes.json();
                    allBookings.value = Array.isArray(bookingData) ? bookingData : [];
                } catch (err) {
                    console.error('Failed to fetch API data from backend:', err);
                    allClients.value = [];
                    allBookings.value = [];
                }
            };

            onMounted(() => {
                fetchData();
            });

            // Filtered Clients for Table
            const filteredClients = computed(() => {
                if (!Array.isArray(allClients.value)) return [];
                return allClients.value.filter(c => {
                    const matchSearch = searchQuery.value === '' || 
                        (c.nameCn && c.nameCn.toLowerCase().includes(searchQuery.value.toLowerCase())) ||
                        (c.voucherNo && c.voucherNo.toLowerCase().includes(searchQuery.value.toLowerCase())) ||
                        (c.hkid && c.hkid.toLowerCase().includes(searchQuery.value.toLowerCase())) ||
                        (c.district && c.district.toLowerCase().includes(searchQuery.value.toLowerCase()));
                    
                    const matchPic = filterPic.value === 'ALL' || c.pic === filterPic.value;
                    const matchStatus = filterStatus.value === 'ALL' || c.status === filterStatus.value;
                    
                    return matchSearch && matchPic && matchStatus;
                });
            });

            const totalPages = computed(() => Math.ceil(filteredClients.value.length / pageSize.value) || 1);

            const paginatedClients = computed(() => {
                const start = (currentPage.value - 1) * pageSize.value;
                return filteredClients.value.slice(start, start + pageSize.value);
            });

            const selectClient = (client) => {
                selectedClient.value = client;
                activeTab.value = 'info';
            };

            const getCopayRatio = (tier) => {
                if (tier === 'Cat I') return 0.05;
                if (tier === 'Cat II') return 0.08;
                if (tier === 'Cat III') return 0.12;
                if (tier === 'Cat IV') return 0.16;
                if (tier === 'Cat V') return 0.25;
                if (tier === 'Cat VI') return 0.40;
                return 0.05;
            };

            const getClientBookedTotal = (clientId) => {
                return 0; 
            };

            const statsForCurrentPic = computed(() => {
                if (!Array.isArray(allClients.value)) return { count: 0 };
                const list = allClients.value.filter(c => c.pic === currentPicUser.value);
                return { count: list.length };
            });

            const totalBookedForPic = computed(() => 0);
            const monthlyTotalBookingsCount = computed(() => Array.isArray(allBookings.value) ? allBookings.value.length : 0);

            const clientsOfCurrentPic = computed(() => Array.isArray(allClients.value) ? allClients.value.filter(c => c.pic === currentPicUser.value) : []);
            const otherClients = computed(() => Array.isArray(allClients.value) ? allClients.value.filter(c => c.pic !== currentPicUser.value) : []);

            const switchWorkspaceClient = (id) => {
                const found = allClients.value.find(c => c.id == id);
                if (found) selectedClient.value = found;
            };

            const openAddClientModal = () => {
                newClient.value = {
                    clientId: '',
                    patientId: '',
                    voucherNo: '',
                    hkid: '',
                    nameCn: '',
                    nameEn: '',
                    copayTier: 'Cat I',
                    pic: picOptions[0],
                    adminClientName: '',
                    district: '',
                    address: '',
                    telephone: '',
                };
                addClientError.value = '';
                addClientNotice.value = '';
                addClientModal.value = true;
            };

            const saveNewClient = async () => {
                isSavingClient.value = true;
                addClientError.value = '';
                try {
                    const clientDetails = { ...newClient.value };
                    delete clientDetails.pic;
                    const res = await fetch(`${apiBaseUrl}/api/clients`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(clientDetails)
                    });
                    const responseText = await res.text();
                    let result;
                    try {
                        result = responseText ? JSON.parse(responseText) : {};
                    } catch {
                        if (res.status === 404) {
                            throw new Error('Client API returned HTTP 404. Restart or redeploy the backend so it loads the POST /api/clients route.');
                        }
                        throw new Error(`Client API returned HTTP ${res.status} with a non-JSON response.`);
                    }
                    if (!res.ok) {
                        throw new Error(result.error || `Client API returned HTTP ${res.status}`);
                    }
                    addClientModal.value = false;
                    currentPage.value = 1;
                    addClientNotice.value = '個案已成功新增。';
                    await fetchData();
                } catch (err) {
                    console.error('Error adding client:', err);
                    addClientError.value = err.message || 'Unable to save client.';
                } finally {
                    isSavingClient.value = false;
                }
            };

            const openBookingModal = () => {
                addBookingModal.value = true;
            };

            const saveBooking = async () => {
                if (!selectedClient.value) return;
                try {
                    const res = await fetch(`${apiBaseUrl}/api/bookings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clientId: selectedClient.value.id,
                            startTime: `${newBooking.value.date} ${newBooking.value.startTime}:00`,
                            endTime: `${newBooking.value.date} ${newBooking.value.endTime}:00`,
                            remarks: `${newBooking.value.serviceName} - ${newBooking.value.providerName}`
                        })
                    });
                    if (!res.ok) {
                        throw new Error(`Booking API returned HTTP ${res.status}`);
                    }
                    addBookingModal.value = false;
                    fetchData(); // Refresh data
                } catch (err) {
                    console.error('Error saving booking:', err);
                }
            };

            const removeBooking = (id) => {
                // Handle deletion logic if needed
            };

            const printWindow = () => {
                window.print();
            };

            return {
                allClients, allBookings, selectedClient, activeTab,
                globalServiceMonth, currentPicUser, picOptions,
                searchQuery, filterPic, filterStatus, currentPage, pageSize,
                filteredClients, totalPages, paginatedClients,
                selectClient, getCopayRatio, getClientBookedTotal,
                statsForCurrentPic, totalBookedForPic, monthlyTotalBookingsCount,
                clientsOfCurrentPic, otherClients, switchWorkspaceClient,
                addBookingModal, bookingMode, newBooking,
                openBookingModal, saveBooking, removeBooking, printWindow,
                addClientModal, newClient, isSavingClient, addClientError,
                addClientNotice,
                openAddClientModal, saveNewClient,
                currentClientTotalFee: ref(0), currentClientTotalHours: ref(0),
                currentClientTotalSessions: ref(0), currentClientBookings: ref([]),
                workspaceTabs: [
                    { id: 'info', name: '個案資料 (Form 7)', icon: 'fa-solid fa-address-card' },
                    { id: 'calendar', name: '月曆排班 (B Sheet)', icon: 'fa-solid fa-calendar-days' },
                    { id: 'schedule', name: '行程明細 (A Sheet)', icon: 'fa-solid fa-list-check' },
                    { id: 'reports', name: '正式月報表', icon: 'fa-solid fa-print' }
                ],
                weekDays: ['日', '一', '二', '三', '四', '五', '六'],
                batchBooking: { startDate: '', endDate: '', selectedDays: [] }
            };
        }
    }).mount('#app');
}