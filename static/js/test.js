// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const testAllBtn = document.getElementById('test-all-btn');
    const continueBtn = document.getElementById('continue-btn');
    const statusIcons = {
        internet: document.getElementById('internet-status'),
        camera: document.getElementById('camera-status'),
        mic: document.getElementById('mic-status')
    };
    const cameraFeed = document.getElementById('camera-feed');
    const microphoneSelect = document.getElementById('microphone-select');
    const cameraSelect = document.getElementById('camera-select');
    const volumeLevel = document.getElementById('volume-level');
    const volumeText = document.getElementById('volume-text');
    
    // Variables para stream y analizador de audio
    let stream = null;
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let isTesting = false;
    let volumeAnimationId = null;
    let micCheckInterval = null;
    let availableDevices = {
        audioInputs: [],
        videoInputs: []
    };
    
    // Estado inicial - todos en rojo
    statusIcons.internet.classList.remove('active');
    statusIcons.camera.classList.remove('active');
    statusIcons.mic.classList.remove('active');
    
    // Función para verificar si los dispositivos están seleccionados
    function areDevicesSelected() {
        const isCameraSelected = cameraSelect.value && cameraSelect.value !== '';
        const isMicrophoneSelected = microphoneSelect.value && microphoneSelect.value !== '';
        
        return isCameraSelected && isMicrophoneSelected;
    }
    
    // Función para actualizar estado de los íconos basado en selección
    function updateStatusIconsBasedOnSelection() {
        const isCameraSelected = cameraSelect.value && cameraSelect.value !== '';
        const isMicrophoneSelected = microphoneSelect.value && microphoneSelect.value !== '';
        
        // Solo mostrar verde si está seleccionado Y funcionando
        if (!isCameraSelected) {
            statusIcons.camera.classList.remove('active');
        }
        if (!isMicrophoneSelected) {
            statusIcons.mic.classList.remove('active');
        }
    }
    
    // Función para verificar conectividad a Internet
    function checkInternetConnection() {
        return navigator.onLine;
    }
    
    // Función para verificar si el navegador soporta los APIs necesarios
    function checkBrowserSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('navigator.mediaDevices no está disponible');
            return false;
        }
        
        if (!window.AudioContext && !window.webkitAudioContext) {
            console.error('AudioContext no está disponible');
            return false;
        }
        
        return true;
    }
    
    // Función para enumerar dispositivos disponibles
    async function enumerateDevices() {
        try {
            // Primero solicitamos permisos básicos para obtener labels de dispositivos
            await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            // Limpiar selects
            microphoneSelect.innerHTML = '<option value="">Seleccionar micrófono...</option>';
            cameraSelect.innerHTML = '<option value="">Seleccionar cámara...</option>';
            
            // Agrupar dispositivos por tipo
            availableDevices.audioInputs = devices.filter(device => device.kind === 'audioinput');
            availableDevices.videoInputs = devices.filter(device => device.kind === 'videoinput');
            
            // Llenar select de micrófonos
            availableDevices.audioInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Micrófono ${index + 1}`;
                microphoneSelect.appendChild(option);
            });
            
            // Llenar select de cámaras
            availableDevices.videoInputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Cámara ${index + 1}`;
                cameraSelect.appendChild(option);
            });
            
            console.log('Dispositivos enumerados:', availableDevices);
            
        } catch (error) {
            console.error('Error enumerando dispositivos:', error);
            
            // Fallback: intentar enumerar sin permisos
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                
                microphoneSelect.innerHTML = '<option value="">Seleccionar micrófono...</option>';
                cameraSelect.innerHTML = '<option value="">Seleccionar cámara...</option>';
                
                devices.filter(d => d.kind === 'audioinput').forEach((device, index) => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Micrófono ${index + 1}`;
                    microphoneSelect.appendChild(option);
                });
                
                devices.filter(d => d.kind === 'videoinput').forEach((device, index) => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Cámara ${index + 1}`;
                    cameraSelect.appendChild(option);
                });
            } catch (fallbackError) {
                console.error('Error en fallback de enumeración:', fallbackError);
            }
        }
    }
    
    // Función para acceder a la cámara y micrófono
    async function accessCamera() {
        try {
            // Verificar que los dispositivos estén seleccionados
            if (!areDevicesSelected()) {
                throw new Error('Por favor, selecciona tanto la cámara como el micrófono antes de probar.');
            }
            
            // Detener stream anterior si existe
            if (stream) {
                stopStream();
            }
            
            // Obtener dispositivos seleccionados
            const selectedCamera = cameraSelect.value;
            const selectedMicrophone = microphoneSelect.value;
            
            // Construir constraints con dispositivos específicos
            const constraints = {
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 },
                    deviceId: { exact: selectedCamera }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 44100,
                    deviceId: { exact: selectedMicrophone }
                }
            };
            
            console.log('Solicitando dispositivos con constraints:', constraints);
            
            // Solicitar permisos para cámara y micrófono
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Mostrar vista previa de la cámara
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';
            
            cameraFeed.innerHTML = '';
            cameraFeed.appendChild(video);
            
            // Configurar análisis de audio
            setupAudioAnalysis(stream);
            
            console.log('Cámara y micrófono accedidos correctamente');
            return true;
            
        } catch (error) {
            console.error('Error al acceder a la cámara/micrófono:', error);
            
            let errorMessage = 'No se pudo acceder a los dispositivos. ';
            
            switch (error.name) {
                case 'NotAllowedError':
                    errorMessage += 'Permisos denegados. Por favor, permite el acceso a cámara y micrófono en la configuración de tu navegador.';
                    break;
                case 'NotFoundError':
                    errorMessage += 'No se encontraron dispositivos de cámara/micrófono.';
                    break;
                case 'NotSupportedError':
                    errorMessage += 'Tu navegador no soporta esta funcionalidad.';
                    break;
                case 'NotReadableError':
                    errorMessage += 'Los dispositivos están siendo usados por otra aplicación.';
                    break;
                case 'OverconstrainedError':
                    errorMessage += 'No se puede satisfacer la restricción del dispositivo seleccionado. Intenta con otro dispositivo.';
                    break;
                default:
                    errorMessage += error.message || 'Error desconocido: ' + error;
            }
            
            cameraFeed.innerHTML = `
                <div class="camera-placeholder" style="color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${errorMessage}</p>
                    <button id="retry-btn" class="nav-btn" style="margin-top: 10px;">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
            
            // Agregar evento al botón de reintentar
            document.getElementById('retry-btn').addEventListener('click', function() {
                testDevices();
            });
            
            return false;
        }
    }
    
    // Función para configurar análisis de audio
    function setupAudioAnalysis(stream) {
        try {
            // Crear contexto de audio
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            
            // Obtener track de audio del stream
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                // Crear fuente de medios desde el stream
                microphone = audioContext.createMediaStreamSource(stream);
                
                // Configurar analizador para MÁXIMA sensibilidad (el doble)
                analyser.fftSize = 2048; // Mayor resolución para más sensibilidad
                analyser.smoothingTimeConstant = 0.1; // Mínimo suavizado para máxima sensibilidad
                analyser.minDecibels = -90; // Rango mucho más bajo
                analyser.maxDecibels = -10;  // Rango más alto
                
                microphone.connect(analyser);
                
                // Iniciar monitoreo de volumen
                startVolumeMonitoring();
                
                console.log('Análisis de audio configurado correctamente');
            } else {
                console.warn('No se encontraron tracks de audio en el stream');
            }
        } catch (error) {
            console.error('Error configurando análisis de audio:', error);
        }
    }
    
    // Función para monitorear el volumen
    function startVolumeMonitoring() {
        if (!analyser) return;
        
        // Detener animación anterior si existe
        if (volumeAnimationId) {
            cancelAnimationFrame(volumeAnimationId);
        }
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        function updateVolume() {
            analyser.getByteFrequencyData(dataArray);
            
            // Calcular el promedio de volumen con MÁXIMA sensibilidad (EL DOBLE)
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            
            // Convertir a porcentaje (0-100) con EL DOBLE de sensibilidad
            // Usamos 64 en lugar de 128 para duplicar la sensibilidad
            const volumePercent = Math.min(100, (average / 32) * 100);
            
            // Actualizar la barra de volumen
            volumeLevel.style.width = volumePercent + '%';
            volumeText.textContent = Math.round(volumePercent) + '%';
            
            // Cambiar color según el nivel
            volumeLevel.className = 'volume-level';
            if (volumePercent < 30) {
                volumeLevel.classList.add('low');
            } else if (volumePercent < 70) {
                volumeLevel.classList.add('medium');
            } else {
                volumeLevel.classList.add('high');
            }
            
            volumeAnimationId = requestAnimationFrame(updateVolume);
        }
        
        updateVolume();
    }
    
    // Función para verificar si el micrófono está captando audio
    function isMicrophoneWorking() {
        if (!analyser) {
            return false;
        }
        
        try {
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            
            console.log('Nivel de audio detectado:', average);
            
            // Umbral MÁS BAJO para máxima sensibilidad (la mitad del anterior)
            return average > 0.5; // Era 1, ahora 0.5 para el doble de sensibilidad
        } catch (error) {
            console.error('Error verificando micrófono:', error);
            return false;
        }
    }
    
    // Función para detener el stream
    function stopStream() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (audioContext) {
            audioContext.close().catch(console.error);
            audioContext = null;
        }
        if (volumeAnimationId) {
            cancelAnimationFrame(volumeAnimationId);
            volumeAnimationId = null;
        }
        
        if (micCheckInterval) {
            clearInterval(micCheckInterval);
            micCheckInterval = null;
        }
        // Forzamos el reset del flag de test para permitir una nueva prueba inmediata
        isTesting = false;
        
        // Restaurar el botón si se detuvo bruscamente
        const testAllBtn = document.getElementById('test-all-btn');
        if(testAllBtn) {
            testAllBtn.innerHTML = '<i class="fas fa-vial"></i> Probar todos los dispositivos';
            testAllBtn.disabled = false;
        }
        // --------------------

        analyser = null;
        microphone = null;
        
        // Resetear barra de volumen
        const volumeLevel = document.getElementById('volume-level');
        const volumeText = document.getElementById('volume-text');
        if(volumeLevel) {
            volumeLevel.style.width = '0%';
            volumeText.textContent = '0%';
            volumeLevel.className = 'volume-level';
        }
    }
    
    // Función para mostrar instrucciones de permisos
    function showPermissionInstructions() {
        cameraFeed.innerHTML = `
            <div class="camera-placeholder" style="color: #f39c12;">
                <i class="fas fa-info-circle"></i>
                <p>Se solicitarán permisos para cámara y micrófono.</p>
                <p style="font-size: 14px; margin-top: 10px;">
                    Por favor, haz clic en "Permitir" cuando tu navegador lo solicite.
                </p>
            </div>
        `;
    }
    
    // Función para probar dispositivos
    async function testDevices() {
        if (isTesting) return;
        
        isTesting = true;
        
        // Verificar que los dispositivos estén seleccionados
        if (!areDevicesSelected()) {
            showTestResult('error', 'Por favor, selecciona tanto la cámara como el micrófono antes de probar.');
            testAllBtn.disabled = false;
            isTesting = false;
            return;
        }
        
        // Mostrar instrucciones de permisos
        showPermissionInstructions();
        
        // Mostrar mensaje de prueba en progreso
        testAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Solicitando permisos...';
        testAllBtn.disabled = true;
        
        try {
            // Verificar soporte del navegador
            if (!checkBrowserSupport()) {
                throw new Error('Tu navegador no soporta el acceso a cámara y micrófono. Asegúrate de que estás en HTTPS o localhost.');
            }
            
            // Paso 1: Verificar Internet
            setTimeout(() => {
                if (checkInternetConnection()) {
                    statusIcons.internet.classList.add('active');
                    console.log('Conexión a Internet: OK');
                } else {
                    statusIcons.internet.classList.remove('active');
                    console.log('Conexión a Internet: FALLÓ');
                }
                testAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accediendo a dispositivos...';
            }, 1000);
            
            // Paso 2: Acceder a cámara y micrófono
            const devicesWorking = await accessCamera();
            
            if (devicesWorking) {
                statusIcons.camera.classList.add('active');
                console.log('Cámara: OK');
                
                testAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Probando micrófono...';
                
                // Paso 3: Verificar micrófono
                let micCheckCount = 0;
                const maxChecks = 25;
                let micWorking = false;

                // CAMBIO AQUÍ: Usamos la variable global (sin 'const' ni 'let')
                micCheckInterval = setInterval(() => { 
                    micCheckCount++;
                    
                    if (isMicrophoneWorking()) {
                        micWorking = true;
                        statusIcons.mic.classList.add('active');
                        clearInterval(micCheckInterval); // Usar variable global
                        micCheckInterval = null;         // Limpiar variable
                        
                        // Restaurar botón
                        testAllBtn.innerHTML = '<i class="fas fa-vial"></i> Probar todos los dispositivos';
                        testAllBtn.disabled = false;
                        isTesting = false;
                        
                        console.log('Micrófono: OK');
                        showTestResult('success', '¡Prueba completada! Todos los dispositivos están funcionando correctamente.');
                        
                    } else if (micCheckCount >= maxChecks) {
                            clearInterval(micCheckInterval); // Usar variable global
                            micCheckInterval = null;         // Limpiar variable
                        
                        // Verificar si al menos hay un stream de audio activo
                        const audioTracks = stream.getAudioTracks();
                        if (audioTracks.length > 0 && audioTracks[0].readyState === 'live') {
                            statusIcons.mic.classList.add('active');
                            console.log('Micrófono: Stream activo pero sin audio detectado');
                            showTestResult('warning', 'Micrófono disponible pero no se detecta audio. Habla más fuerte o verifica la configuración.');
                        } else {
                            statusIcons.mic.classList.remove('active');
                            showTestResult('error', 'No se pudo acceder al micrófono. Verifica los permisos.');
                        }
                        
                        // Restaurar botón
                        testAllBtn.innerHTML = '<i class="fas fa-vial"></i> Probar todos los dispositivos';
                        testAllBtn.disabled = false;
                        isTesting = false;
                    }
                }, 400);
                
            } else {
                // Dispositivos no funcionan
                statusIcons.camera.classList.remove('active');
                statusIcons.mic.classList.remove('active');
                
                // Restaurar botón
                testAllBtn.innerHTML = '<i class="fas fa-vial"></i> Probar todos los dispositivos';
                testAllBtn.disabled = false;
                isTesting = false;
            }
            
        } catch (error) {
            console.error('Error durante la prueba:', error);
            
            // Restaurar botón
            testAllBtn.innerHTML = '<i class="fas fa-vial"></i> Probar todos los dispositivos';
            testAllBtn.disabled = false;
            isTesting = false;
            
            showTestResult('error', 'Error durante la prueba: ' + error.message);
        }
    }
    
    // Función para mostrar resultado de la prueba
    function showTestResult(type, message) {
        // Remover notificaciones existentes
        const existingAlerts = document.querySelectorAll('.test-alert');
        existingAlerts.forEach(alert => alert.remove());
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'test-alert';
        
        if (type === 'success') {
            alertDiv.style.backgroundColor = '#27ae60';
        } else if (type === 'warning') {
            alertDiv.style.backgroundColor = '#f39c12';
        } else {
            alertDiv.style.backgroundColor = '#e74c3c';
        }
        
        alertDiv.textContent = message;
        document.body.appendChild(alertDiv);
        
        // Remover después de 5 segundos
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    }
    
    // Event Listeners
    testAllBtn.addEventListener('click', function() {
        testDevices();
    });
    
    // Lógica de redirección del botón "Dispositivos listos" (CORREGIDA Y ROBUSTA)
    continueBtn.addEventListener('click', function() {
        const cameraActive = statusIcons.camera.classList.contains('active');
        const micActive = statusIcons.mic.classList.contains('active');
        
        if (!cameraActive || !micActive) {
            showTestResult('error', 'Debes completar la prueba con éxito antes de continuar.');
            return;
        }

        // 1. INFORMAR AL SERVIDOR: Envía una petición para que el servidor
        // sepa que los dispositivos están verificados.
        fetch('/mark-devices-verified', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('La respuesta del servidor no fue exitosa.');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // 2. ÉXITO DEL SERVIDOR: Ahora el servidor ya sabe.
                // Guardamos el estado en el navegador también.
                sessionStorage.setItem('devicesVerified', 'true');
                showTestResult('success', '¡Dispositivos verificados! Redirigiendo...');

                // 3. DECIDIR DESTINO: Leemos el parámetro 'next' de la URL.
                const urlParams = new URLSearchParams(window.location.search);
                const nextUrl = urlParams.get('next');
                
                // Si 'next' existe (ej: '/examen'), vamos ahí. Si no, al launcher.
                const destination = nextUrl || '/launcher';
                
                // 4. REDIRIGIR
                setTimeout(() => {
                    window.location.href = destination;
                }, 1500);

            } else {
                throw new Error(data.message || 'El servidor indicó un error.');
            }
        })
        .catch(error => {
            console.error('Error al marcar dispositivos como verificados:', error);
            showTestResult('error', 'Error de comunicación con el servidor. Inténtalo de nuevo.');
        });
    });
    
    // Función auxiliar para manejar el cambio automático
    function handleDeviceChange() {
        // 1. Detener lo que esté ocurriendo actualmente
        stopStream();
        
        // 2. Actualizar iconos visuales (rojo si no hay selección)
        updateStatusIconsBasedOnSelection();

        // 3. Si ambos tienen valor, ejecutar la prueba automáticamente
        if (areDevicesSelected()) {
            console.log("Cambio de dispositivo detectado, reiniciando prueba...");
            testDevices();
        }
    }

    // Eventos para cambios en dispositivos seleccionados
    cameraSelect.addEventListener('change', function() {
        // Resetear visualmente el feed antes de la prueba
        cameraFeed.innerHTML = `
            <div class="camera-placeholder">
                <i class="fas fa-camera"></i>
                <p>Reiniciando cámara...</p>
            </div>
        `;
        handleDeviceChange();
    });

    microphoneSelect.addEventListener('change', function() {
        handleDeviceChange();
    });
    
    // Limpiar recursos
    window.addEventListener('beforeunload', function() {
        stopStream();
    });
    
    // Inicialización
    setTimeout(() => {
        // Verificar Internet
        if (checkInternetConnection()) {
            statusIcons.internet.classList.add('active');
        }
        
        // Enumerar dispositivos disponibles
        enumerateDevices();
        
        // Verificar soporte del navegador
        if (!checkBrowserSupport()) {
            const errorMessage = 'Tu navegador no soporta acceso a cámara/micrófono. Asegúrate de que estás en HTTPS o localhost.';
            console.error(errorMessage);
            cameraFeed.innerHTML = `
                <div class="camera-placeholder" style="color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${errorMessage}</p>
                    <p style="font-size: 14px; margin-top: 10px;">
                        Usa Chrome, Firefox, Edge o Safari en sus versiones más recientes.
                    </p>
                </div>
            `;
            testAllBtn.disabled = true;
        }
    }, 500);
});