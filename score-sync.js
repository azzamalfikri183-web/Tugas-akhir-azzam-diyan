(function() {
    var config = window.TAPAK_SUCI_FIREBASE_CONFIG || {};
    var requiredConfig = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
    var configured = requiredConfig.every(function(key) { return Boolean(config[key]); });
    var database = null;
    var authReady = Promise.resolve(null);
    var roomReference = null;
    var roomListener = null;
    var roomCode = '';
    var initialParams = new URLSearchParams(window.location.search);
    var monitorMode = initialParams.get('mode') === 'monitor';
    var playerMode = initialParams.get('mode') === 'player';
    var roomStatus = document.getElementById('score-room-status');
    var roomDetail = document.getElementById('score-room-detail');
    var roomCodeInput = document.getElementById('score-room-code');
    var shareRoomButton = document.getElementById('score-room-share');
    var monitorShareButton = document.getElementById('score-monitor-share');
    var nameTimers = [null, null];

    document.body.dataset.scoreMode = monitorMode ? 'monitor' : playerMode ? 'player' : 'controller';

    function setRoomStatus(message, state) {
        roomStatus.textContent = message;
        roomStatus.dataset.state = state || 'default';
    }

    function normalizeRoom(value) {
        var names = Array.isArray(value.names) ? value.names : [];
        var scores = Array.isArray(value.scores) ? value.scores : [];
        var disqualified = Array.isArray(value.disqualified) ? value.disqualified : [];
        return {
            names: [String(names[0] || 'Pesilat Merah').slice(0, 40), String(names[1] || 'Pesilat Biru').slice(0, 40)],
            scores: [Number.parseInt(scores[0], 10) || 0, Number.parseInt(scores[1], 10) || 0],
            disqualified: [Boolean(disqualified[0]), Boolean(disqualified[1])],
            history: Array.isArray(value.history) ? value.history.slice(-30) : []
        };
    }

    function updateRoomUrl(code) {
        var url = new URL(window.location.href);
        url.searchParams.set('room', code);
        if (monitorMode) url.searchParams.set('mode', 'monitor');
        else if (playerMode) url.searchParams.set('mode', 'player');
        else url.searchParams.delete('mode');
        url.hash = 'skor';
        window.history.replaceState({}, '', url.toString());
    }

    function subscribeToRoom(code, reference) {
        if (roomReference && roomListener) roomReference.off('value', roomListener);
        roomReference = reference;
        roomCode = code;
        roomCodeInput.value = code;
        shareRoomButton.disabled = false;
        monitorShareButton.disabled = false;
        roomDetail.textContent = 'Kode room: ' + code + ' · semua perangkat bergabung memakai kode ini.';
        updateRoomUrl(code);
        roomListener = function(snapshot) {
            if (!snapshot.exists()) {
                setRoomStatus('Room tidak ditemukan atau telah dihapus.', 'error');
                return;
            }
            window.scoreData = normalizeRoom(snapshot.val());
            window.renderScoreboard();
            setRoomStatus(monitorMode ? 'MONITOR SERVER · LIVE' : 'TERHUBUNG · LIVE', 'live');
        };
        roomReference.on('value', roomListener, function(error) {
            setRoomStatus('Gagal menerima skor: ' + error.message, 'error');
        });
    }

    function connectToRoom(code, createNew) {
        if (!database) {
            setRoomStatus('Sinkronisasi server belum aktif.', 'error');
            roomDetail.textContent = 'Isi konfigurasi Firebase di firebase-config.js untuk membuat atau bergabung ke room.';
            return;
        }
        code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
        if (!code) {
            setRoomStatus('Masukkan kode room.', 'error');
            return;
        }
        setRoomStatus('Menghubungkan ke room ' + code + '...', 'default');
        authReady.then(function(user) {
            if (!user) throw new Error('Login anonim Firebase belum aktif.');
            var reference = database.ref('matches/' + code);
            if (createNew) {
                var room = normalizeRoom(window.scoreData);
                room.updatedAt = Date.now();
                return reference.set(room).then(function() { subscribeToRoom(code, reference); });
            }
            return reference.once('value').then(function(snapshot) {
                if (!snapshot.exists()) throw new Error('Kode room tidak ditemukan.');
                subscribeToRoom(code, reference);
            });
        }).catch(function(error) {
            setRoomStatus(error.message || 'Tidak dapat terhubung ke Firebase.', 'error');
        });
    }

    function generateRoomCode() {
        var alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        var bytes = new Uint8Array(12);
        if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
        else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        return Array.from(bytes, function(value) { return alphabet[value % alphabet.length]; }).join('');
    }

    function copyRoomLink(monitor) {
        if (!roomCode) return;
        var url = new URL(window.location.href);
        url.searchParams.set('room', roomCode);
        if (monitor) url.searchParams.set('mode', 'monitor');
        else url.searchParams.set('mode', 'player');
        url.hash = 'skor';
        if (!navigator.clipboard) {
            roomCodeInput.value = url.toString();
            setRoomStatus('Tautan ditampilkan di kolom kode room.', 'default');
            return;
        }
        navigator.clipboard.writeText(url.toString()).then(function() {
            setRoomStatus(monitor ? 'Link monitor server tersalin.' : 'Link pemain tersalin.', 'live');
        }).catch(function() {
            roomCodeInput.value = url.toString();
            setRoomStatus('Salin tautan dari kolom kode room.', 'default');
        });
    }

    function mutateRoom(mutator) {
        if (!roomReference) return false;
        roomReference.transaction(function(current) {
            if (!current) return;
            current = normalizeRoom(current);
            mutator(current);
            current.updatedAt = Date.now();
            return current;
        }, function(error, committed) {
            if (error || !committed) setRoomStatus('Perubahan gagal tersimpan di server.', 'error');
        }, false);
        return true;
    }

    function applyMode() {
        var isDq = window.scoreData.disqualified[0] || window.scoreData.disqualified[1];
        document.getElementById('score-monitor-banner').hidden = !monitorMode;
        document.querySelectorAll('[data-score-team]').forEach(function(button) {
            button.disabled = monitorMode || isDq;
        });
        document.getElementById('score-red-name').readOnly = monitorMode;
        document.getElementById('score-blue-name').readOnly = monitorMode;
        document.getElementById('score-reset').disabled = monitorMode;
        document.getElementById('score-undo').disabled = monitorMode || window.scoreData.history.length === 0;
    }

    window.scoreSync = {
        applyMode: applyMode,
        apply: function(team, label, delta, isDisqualification) {
            if (!roomReference) return false;
            if (monitorMode) return true;
            return mutateRoom(function(room) {
                if (room.disqualified[0] || room.disqualified[1]) return;
                var previous = room.scores[team];
                var next = previous + delta;
                room.scores[team] = next;
                if (isDisqualification) room.disqualified[team] = true;
                room.history.push({ team: team, name: room.names[team], label: label, delta: next - previous, previous: previous, score: next, disqualification: isDisqualification });
                room.history = room.history.slice(-30);
            });
        },
        updateName: function(team, name) {
            if (!roomReference) return false;
            if (monitorMode) return true;
            window.clearTimeout(nameTimers[team]);
            nameTimers[team] = window.setTimeout(function() {
                mutateRoom(function(room) { room.names[team] = String(name).slice(0, 40); });
            }, 250);
            return true;
        },
        undo: function() {
            if (!roomReference) return false;
            if (monitorMode) return true;
            return mutateRoom(function(room) {
                var lastAction = room.history.pop();
                if (!lastAction) return;
                room.scores[lastAction.team] = lastAction.previous;
                if (lastAction.disqualification) room.disqualified[lastAction.team] = false;
            });
        },
        reset: function() {
            if (!roomReference) return false;
            if (monitorMode) return true;
            return mutateRoom(function(room) {
                room.scores = [0, 0];
                room.disqualified = [false, false];
                room.history = [];
            });
        }
    };

    document.getElementById('score-room-create').addEventListener('click', function() {
        connectToRoom(generateRoomCode(), true);
    });
    document.getElementById('score-room-join').addEventListener('click', function() {
        connectToRoom(roomCodeInput.value, false);
    });
    roomCodeInput.addEventListener('input', function(event) {
        event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    });
    shareRoomButton.addEventListener('click', function() { copyRoomLink(false); });
    monitorShareButton.addEventListener('click', function() { copyRoomLink(true); });

    if (configured && window.firebase) {
        try {
            if (!window.firebase.apps.length) window.firebase.initializeApp(config);
            database = window.firebase.database();
            authReady = window.firebase.auth().signInAnonymously().then(function(credential) {
                return credential.user;
            }).catch(function(error) {
                setRoomStatus('Login Firebase gagal.', 'error');
                roomDetail.textContent = error.message;
                return null;
            });
            setRoomStatus('Siap membuat atau bergabung ke room.', 'default');
        } catch (error) {
            setRoomStatus('Konfigurasi Firebase tidak valid.', 'error');
            roomDetail.textContent = error.message;
        }
    } else {
        setRoomStatus('Mode lokal · Firebase belum dikonfigurasi.', 'default');
        roomDetail.textContent = 'Isi firebase-config.js untuk sinkron antar-HP dan monitor server.';
    }

    applyMode();
    var initialRoomCode = new URLSearchParams(window.location.search).get('room');
    if (initialRoomCode) {
        roomCodeInput.value = initialRoomCode.toUpperCase();
        connectToRoom(initialRoomCode, false);
    }
})();