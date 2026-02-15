// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    
    // ==========================================
    // 1. REFERENCIAS AL DOM
    // ==========================================
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const reviewBtn = document.getElementById('review-btn');
    const finishNavBtn = document.getElementById('finish-nav-btn');
    const countdownElement = document.getElementById('countdown');
    const navItems = document.querySelectorAll('.nav-item');
    const questionContainers = document.querySelectorAll('.question-container');
    const examContainer = document.querySelector('.exam-container');
    
    // Referencias de Cámara y UI extra
    const cameraFeed = document.getElementById('camera-feed');
    const volumeLevel = document.getElementById('volume-level');
    const volumeText = document.getElementById('volume-text');
    const cameraStatusIcon = document.getElementById('camera-status-icon');
    const cameraStatusText = document.getElementById('camera-status-text');
    const cameraProblemLink = document.getElementById('camera-problem-link');
    const restartCameraLink = document.getElementById('restart-camera-link');
    const bathroomLink = document.getElementById('bathroom-link');
    const bathroomCountdownElement = document.getElementById('bathroom-countdown');

    // Referencias de SEGURIDAD
    const securityOverlay = document.getElementById('security-overlay');
    const startSecureBtn = document.getElementById('btn-start-secure');
    const mainContainer = document.getElementById('main-container');
    const blackoutCurtain = document.getElementById('blackout-curtain');

    // ==========================================
    // 2. VARIABLES DE ESTADO
    // ==========================================
    let totalQuestions = window.examConfig.totalQuestions || 0;
    let currentQuestion = 0;
    let currentZoom = 1.0;
    // IMPORTANTE: timeLeft se inicializa SIEMPRE con lo que manda el servidor (app.py)
    let timeLeft = window.examConfig.totalSeconds; 
    let answeredQuestions = new Set();
    let reviewQuestions = new Set();
    
    // Variables de Baño
    let bathroomCountdownInterval = null;
    let bathroomTimeLeft = 300; 
    let onBathroomBreak = false;
    let bathroomBreakUsed = false;

    // Variables de Cámara/Micrófono
    let stream = null;
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let volumeAnimationId = null;

    // ==========================================
    // 3. SISTEMA DE SEGURIDAD (MODO KIOSCO HÍBRIDO)
    // ==========================================

    async function enableSecureMode() {
        const elem = document.documentElement;
        
        // FIX: Bandera para ignorar eventos de blur durante la transición
        window.isSwitchingToFullscreen = true;

        try {
            // 1. Intentar Pantalla Completa
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen(); // Safari
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen(); // IE/Edge legacy
            }

            // 2. Intentar Bloqueo de Teclado
            if ('keyboard' in navigator && 'lock' in navigator.keyboard) {
                try {
                    await navigator.keyboard.lock(['Escape', 'AltLeft', 'AltRight', 'Tab', 'MetaLeft', 'MetaRight']);
                    console.log('Teclado bloqueado (Modo Seguro Activo)');
                } catch (e) {
                    console.warn('No se pudo bloquear teclado:', e);
                }
            }

            // 3. Ocultar overlay e iniciar examen
            securityOverlay.style.display = 'none';
            
            // FIX: Asegurar explícitamente que la cortina negra esté oculta y el blur desactivado
            blackoutCurtain.style.display = 'none';
            if (mainContainer) mainContainer.classList.remove('content-blur');

            initExam(); 
            
        } catch (err) {
            console.error(err);
            // Si falla (ej: usuario canceló), quitamos la bandera
            window.isSwitchingToFullscreen = false;
            alert(`Error: Debes permitir la pantalla completa para realizar el examen.`);
        }

        // FIX: Restaurar la detección de blur después de 1 segundo (cuando la transición haya terminado)
        setTimeout(() => {
            window.isSwitchingToFullscreen = false;
        }, 1000);
    }

    function blockKeyboard(e) {
        // Esta función actúa como respaldo para bloquear teclas si la API keyboard.lock falla
        
        // Permitimos ESC solo si el navegador lo usa para salir de Fullscreen (lo detectaremos en checkFullScreen)
        // Pero tratamos de bloquear todo lo demás.
        if (e.key === 'Escape') {
            return; 
        }

        // Bloquear teclas de función, recarga y navegación
        if (e.key.startsWith('F') || e.ctrlKey || e.altKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    function handleVisibilityChange() {
        // FIX: Si estamos en transición a fullscreen, ignorar este evento
        if (window.isSwitchingToFullscreen) return; 

        if (document.hidden) {
            blackoutCurtain.style.display = 'block';
            document.title = "⚠️ ALERTA DE SEGURIDAD";
            showNotification("¡No cambies de pestaña! Esto se registrará como incidencia.", "alert-danger", 5000);
        } else {
            blackoutCurtain.style.display = 'none';
            document.title = "Examen | Simulador";
        }
    }

    function handleFocusLoss() {
        // FIX: Si estamos en transición a fullscreen, ignorar este evento
        if (window.isSwitchingToFullscreen) return;

        // Usuario dio clic fuera o abrió otra app
        blackoutCurtain.style.display = 'block';
        if (mainContainer) mainContainer.classList.add('content-blur');
    }

    function handleFocusGain() {
        // Regresó el foco a la ventana
        blackoutCurtain.style.display = 'none';
        if (mainContainer) mainContainer.classList.remove('content-blur');
        
        // Forzar foco en la ventana para recuperar control de teclado
        window.focus();
    }

    function checkFullScreen() {
        // Monitor de estado: Si document.fullscreenElement es null, el usuario logró salir
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            
            // Re-activar overlay de bloqueo (Pausa forzada)
            securityOverlay.style.display = 'flex';
            
            // Liberar el teclado si estaba bloqueado para que puedan escribir si es necesario
            if ('keyboard' in navigator && 'unlock' in navigator.keyboard) {
                navigator.keyboard.unlock();
            }

            // Mostrar mensaje de alerta agresivo
            securityOverlay.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 5rem; margin-bottom: 20px; color: #e74c3c;"></i>
                <h2>ALERTA DE SEGURIDAD</h2>
                <p>El sistema ha detectado que saliste del modo seguro.</p>
                <div style="background-color: #c0392b; color: white; padding: 10px; border-radius: 5px; margin-bottom: 20px; font-weight: bold;">
                    INCIDENCIA REGISTRADA
                </div>
                <p>Debes regresar inmediatamente a la pantalla completa para continuar.</p>
                
                <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
                    <button class="btn-secure-start" id="btn-resume-secure">REGRESAR AL EXAMEN</button>
                    <button class="btn-action logout" id="btn-exit-exam-escape" style="background-color: #555; padding: 15px 30px;">FINALIZAR AHORA</button>
                </div>
            `;
            
            // Reasignar eventos a los botones dinámicos
            document.getElementById('btn-resume-secure').addEventListener('click', () => {
                enableSecureMode(); // Volver a intentar bloquear todo
            });
            
            document.getElementById('btn-exit-exam-escape').addEventListener('click', () => {
                 finishExam(); 
            });

        } else {
            // SI ESTAMOS EN PANTALLA COMPLETA:
            // Ocultar overlay
            securityOverlay.style.display = 'none';
            // Forzamos el foco para atrapar el teclado
            window.focus();
        }
    }


    // ==========================================
    // 4. GUARDADO AUTOMÁTICO (LOCALSTORAGE)
    // ==========================================
    // La clave es única por materia + fecha + horario (definido en examId en el HTML)
    const uniqueExamId = window.examConfig.examId || 'default';
    const STORAGE_KEY = 'exam_backup_' + window.location.search + '_' + uniqueExamId;

    function saveProgress() {
        const answers = {};
        document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            answers[radio.name] = radio.value;
        });

        const progressData = {
            answers: answers,
            currentQuestion: currentQuestion, // Guardamos en qué pregunta iba
            bathroomBreakUsed: bathroomBreakUsed,
            timestamp: new Date().getTime()
            // NOTA: NO guardamos timeLeft. Respetamos siempre el reloj del servidor.
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));
    }

    function loadProgress() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        // Si cambió el horario/fecha en la base de datos, savedData será null (clave nueva)
        if (!savedData) return;

        try {
            const data = JSON.parse(savedData);
            
            // Restaurar pregunta actual
            if (typeof data.currentQuestion !== 'undefined') {
                currentQuestion = data.currentQuestion;
            }

            // Restaurar estado del baño
            if (data.bathroomBreakUsed) {
                bathroomBreakUsed = true;
                if (bathroomLink) {
                    bathroomLink.textContent = 'Permiso de baño agotado';
                    bathroomLink.style.opacity = '0.6';
                    bathroomLink.style.cursor = 'not-allowed';
                }
            }

            // Restaurar respuestas
            const answers = data.answers || {};
            let restoredCount = 0;

            for (const [name, value] of Object.entries(answers)) {
                const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
                if (radio) {
                    radio.checked = true;
                    // Actualizar lógica visual (barra verde)
                    const qNum = parseInt(name.split('-')[1]);
                    if (!isNaN(qNum)) {
                        answeredQuestions.add(qNum);
                        const statusElement = document.getElementById(`question-status-${qNum}`);
                        const navElement = document.querySelector(`.nav-item[data-question="${qNum}"]`);
                        
                        if (statusElement) {
                            statusElement.textContent = 'Respondida (Restaurada)';
                            statusElement.classList.add('answered');
                        }
                        if (navElement) {
                            navElement.classList.add('answered');
                        }
                    }
                    restoredCount++;
                }
            }
            
            if (restoredCount > 0) {
                showNotification(`Progreso restaurado: ${restoredCount} respuestas recuperadas.`, 'alert-success', 4000);
            }

        } catch (e) {
            console.error("Error al cargar progreso:", e);
        }
    }

    function clearProgress() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function showNotification(message, type = 'alert-info', duration = 5000) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `message-alert ${type}`;
        alertDiv.innerHTML = message;
        document.body.appendChild(alertDiv);
        setTimeout(() => {
            alertDiv.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                if (alertDiv) alertDiv.remove();
            }, 300);
        }, duration);
    }

    // ==========================================
    // 5. INICIALIZACIÓN DEL EXAMEN
    // ==========================================
    function initExam() {
        // Cargar datos previos (si coincide la fecha/hora)
        loadProgress(); 
        
        showQuestion(currentQuestion);
        
        // Verificar tiempo real del servidor
        if (timeLeft <= 0) {
            if (countdownElement) countdownElement.textContent = "¡Tiempo agotado!";
            alert('El tiempo del examen ha finalizado según el horario del servidor.');
            submitExam();
            return;
        }

        startCountdown();
        setupNavigation();
        setupNavBar();
        setupAnswerEvents();
        setupZoom();
        initCamera(); // Iniciar cámara
    }

    // ==========================================
    // 6. LÓGICA DE PREGUNTAS Y NAVEGACIÓN
    // ==========================================
    function showQuestion(questionNumber) {
        questionContainers.forEach(container => container.classList.remove('active'));
        const currentQuestionElement = document.querySelector(`.question-container[data-question="${questionNumber}"]`);
        if (currentQuestionElement) currentQuestionElement.classList.add('active');
        updateNavBar(questionNumber);
        updateNavigationButtons();
    }

    function setupNavigation() {
        prevBtn.addEventListener('click', () => { 
            if (currentQuestion > 0) {
                currentQuestion--;
                showQuestion(currentQuestion); 
                saveProgress(); 
            }
        });
        nextBtn.addEventListener('click', () => { 
            if (currentQuestion < totalQuestions) {
                currentQuestion++;
                showQuestion(currentQuestion); 
                saveProgress(); 
            }
        });
        
        reviewBtn.addEventListener('click', () => {
            if (currentQuestion > 0 && currentQuestion <= totalQuestions) {
                const statusElement = document.getElementById(`question-status-${currentQuestion}`);
                const navElement = document.querySelector(`.nav-item[data-question="${currentQuestion}"]`);
                
                if (reviewQuestions.has(currentQuestion)) {
                    reviewQuestions.delete(currentQuestion);
                    statusElement.textContent = answeredQuestions.has(currentQuestion) ? 'Respondida' : '';
                    statusElement.classList.remove('review');
                    navElement.classList.remove('review');
                    if (answeredQuestions.has(currentQuestion)) navElement.classList.add('answered');
                } else {
                    reviewQuestions.add(currentQuestion);
                    statusElement.textContent = 'Para revisión';
                    statusElement.classList.add('review');
                    navElement.classList.add('review');
                    navElement.classList.remove('answered');
                }
            }
        });
    }

    function setupNavBar() {
        navItems.forEach(item => {
            item.addEventListener('click', function() {
                if (this.id === 'finish-nav-btn') {
                    finishExam();
                } else {
                    const questionNum = parseInt(this.getAttribute('data-question'));
                    if (!isNaN(questionNum)) {
                        currentQuestion = questionNum;
                        showQuestion(currentQuestion);
                        saveProgress();
                    }
                }
            });
        });
    }

    function setupAnswerEvents() {
        // A. Evento nativo del radio button
        document.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', function() {
                const questionNumber = parseInt(this.name.split('-')[1]);
                if (isNaN(questionNumber)) return;
                
                answeredQuestions.add(questionNumber);
                const statusElement = document.getElementById(`question-status-${questionNumber}`);
                const navElement = document.querySelector(`.nav-item[data-question="${questionNumber}"]`);
                
                if (reviewQuestions.has(questionNumber)) reviewQuestions.delete(questionNumber);
                
                if (statusElement && navElement) {
                    statusElement.textContent = 'Respondida';
                    statusElement.classList.add('answered');
                    statusElement.classList.remove('review');
                    navElement.classList.add('answered');
                    navElement.classList.remove('review');
                }
                
                saveProgress(); 
            });
        });

        // B. Evento clic en el contenedor (MEJORA UX)
        document.querySelectorAll('.answer-option').forEach(option => {
            option.addEventListener('click', function(e) {
                // Si el clic fue directo en el input o label, dejar que el navegador actúe
                if (e.target.type === 'radio' || e.target.tagName === 'LABEL') return;

                const radio = this.querySelector('input[type="radio"]');
                if (radio && !radio.checked) {
                    radio.checked = true;
                    // Forzar el evento change manualmente
                    radio.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    function setupZoom() {
        const updateZoom = () => {
            examContainer.style.transform = `scale(${currentZoom})`;
            const inverseScale = 1 / currentZoom;
            examContainer.style.width = `${inverseScale * 100}%`;
            examContainer.style.height = 'auto'; 
        };
        zoomInBtn.addEventListener('click', () => { 
            if (currentZoom < 1.5) { 
                currentZoom = parseFloat((currentZoom + 0.1).toFixed(2)); 
                updateZoom(); 
            } 
        });
        zoomOutBtn.addEventListener('click', () => { 
            if (currentZoom > 0.7) { 
                currentZoom = parseFloat((currentZoom - 0.1).toFixed(2)); 
                updateZoom(); 
            } 
        });
        updateZoom();
    }

    function updateNavBar(questionNumber) {
        navItems.forEach(item => item.classList.remove('active'));
        const currentNavItem = document.querySelector(`.nav-item[data-question="${questionNumber}"]`);
        if (currentNavItem) currentNavItem.classList.add('active');
    }

    function updateNavigationButtons() {
        prevBtn.disabled = currentQuestion === 0;
        prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
        prevBtn.style.cursor = prevBtn.disabled ? 'not-allowed' : 'pointer';
        
        reviewBtn.disabled = (currentQuestion === 0 || currentQuestion > totalQuestions);
        reviewBtn.style.opacity = reviewBtn.disabled ? '0.5' : '1';
        reviewBtn.style.cursor = reviewBtn.disabled ? 'not-allowed' : 'pointer';
        
        nextBtn.disabled = currentQuestion === totalQuestions;
        nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
        nextBtn.style.cursor = nextBtn.disabled ? 'not-allowed' : 'pointer';
    }

    // ==========================================
    // 7. TEMPORIZADOR Y FINALIZACIÓN
    // ==========================================
    function startCountdown() {
        if (totalQuestions === 0 && countdownElement) { 
            countdownElement.textContent = "Error"; 
            return; 
        }

        const updateDisplay = () => {
            const hours = Math.floor(timeLeft / 3600);
            const minutes = Math.floor((timeLeft % 3600) / 60);
            const seconds = timeLeft % 60;
            const timeString = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
            if (countdownElement) countdownElement.textContent = timeString;
        };

        updateDisplay();

        const countdownInterval = setInterval(() => {
            timeLeft--;

            if (timeLeft % 5 === 0) {
                saveProgress(); // Autoguardado periódico
            }

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                updateDisplay();
                if (countdownElement) countdownElement.textContent = "¡Tiempo agotado!";
                
                setTimeout(() => {
                    alert('¡Tiempo agotado! El examen se enviará automáticamente.');
                    submitExam();
                }, 100);
                return;
            }
            updateDisplay();
        }, 1000);
    }

    function finishExam() {
        const unanswered = totalQuestions - answeredQuestions.size;
        const msg = unanswered > 0 
            ? `Tienes ${unanswered} pregunta(s) sin responder. ¿Seguro que deseas finalizar?` 
            : '¿Seguro que deseas finalizar el examen?';
        
        if (confirm(msg)) {
            submitExam();
        }
    }

    function submitExam() {
        console.log('Enviando examen...');
        
        // Recopilar todas las respuestas
        const respuestas = {};
        document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            const name = radio.name; // "question-1"
            const questionNumber = name.split('-')[1]; // "1"
            respuestas[questionNumber] = radio.value;
        });

        // Enviar respuestas al servidor
        fetch('/api/save-exam-results', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                folio: window.examConfig.folio,
                curso: window.examConfig.curso,
                materia: window.examConfig.materia,
                respuestas: respuestas
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Resultados guardados en el servidor');
                // Limpiar localStorage después de enviar exitosamente
                clearProgress();
                stopCamera();
                alert('Examen enviado correctamente. Redirigiendo al inicio...');
                window.location.href = '/launcher';
            } else {
                console.error('Error al guardar resultados:', data.message);
                // Preguntar si quiere intentar de nuevo
                if (confirm('Error al guardar resultados. ¿Quieres intentar enviar de nuevo?')) {
                    submitExam();
                } else {
                    clearProgress();
                    stopCamera();
                    alert('Examen enviado, pero hubo un problema al guardar los resultados. Contacta al administrador.');
                    window.location.href = '/launcher';
                }
            }
        })
        .catch(error => {
            console.error('Error al enviar resultados:', error);
            // Preguntar si quiere intentar de nuevo
            if (confirm('Error de conexión. ¿Quieres intentar enviar de nuevo?')) {
                submitExam();
            } else {
                clearProgress();
                stopCamera();
                alert('Examen enviado, pero hubo un problema de conexión. Contacta al administrador.');
                window.location.href = '/launcher';
            }
        });
    }

    // ==========================================
    // 8. FUNCIONALIDAD DE BAÑO
    // ==========================================
    function startBathroomCountdown() {
        if (bathroomCountdownInterval) clearInterval(bathroomCountdownInterval);
        
        bathroomCountdownInterval = setInterval(() => {
            if (bathroomTimeLeft <= 0) { 
                clearInterval(bathroomCountdownInterval); 
                bathroomCountdownElement.textContent = '¡Tiempo de baño agotado!'; 
                showNotification('Se ha agotado tu tiempo para ir al baño.', 'alert-danger', 5000); 
                return; 
            }
            bathroomTimeLeft--; 
            const minutes = Math.floor(bathroomTimeLeft / 60); 
            const seconds = bathroomTimeLeft % 60; 
            bathroomCountdownElement.textContent = `Tiempo: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    function stopBathroomCountdown() {
        if (bathroomCountdownInterval) clearInterval(bathroomCountdownInterval); 
        bathroomCountdownInterval = null; 
        bathroomCountdownElement.textContent = ''; 
        bathroomCountdownElement.style.display = 'none';
    }

    function toggleBathroomBreak() {
        if (onBathroomBreak) {
            // Regreso
            onBathroomBreak = false;
            bathroomLink.textContent = 'Permiso de baño utilizado'; 
            bathroomLink.style.opacity = '0.6';
            bathroomLink.style.cursor = 'not-allowed';
            
            stopBathroomCountdown();
            showNotification('Has regresado del baño. Continúa tu examen.', 'alert-info', 3000);
            saveProgress(); 
        } else {
            // Salida
            if (bathroomBreakUsed) {
                showNotification('Ya has utilizado tu único permiso para ir al baño.', 'alert-warning', 4000);
                return;
            }
            
            onBathroomBreak = true;
            bathroomBreakUsed = true;
            bathroomLink.textContent = 'Ya regresé del baño';
            showNotification('Permiso único concedido. Tienes 5 minutos para regresar.', 'alert-success', 4000);
            
            bathroomTimeLeft = 300; 
            bathroomCountdownElement.style.display = 'block';
            startBathroomCountdown();
            saveProgress(); 
        }
    }

    // ==========================================
    // 9. CÁMARA Y MICRÓFONO
    // ==========================================
    async function initCamera() {
        stopCamera();
        try {
            const constraints = { audio: true, video: true };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true; 
            video.playsInline = true; 
            video.muted = true;
            video.style.width = '100%'; 
            video.style.height = '100%'; 
            video.style.objectFit = 'cover';
            
            if (cameraFeed) {
                cameraFeed.innerHTML = ''; 
                cameraFeed.appendChild(video);
            }
            
            setupAudioAnalysis(stream); 
            
            if (cameraStatusIcon) cameraStatusIcon.className = 'fas fa-circle green';
            if (cameraStatusText) { 
                cameraStatusText.textContent = 'Cámara y micrófono activos'; 
                cameraStatusText.style.color = '#27ae60'; 
            }
            
        } catch (error) {
            console.error('Error cámara:', error);
            let errorMessage = 'No se pudo acceder. ';
            
            if (error.name === 'NotAllowedError') errorMessage += 'Permisos denegados.';
            else if (error.name === 'NotFoundError') errorMessage += 'No se encontró cámara.';
            else if (error.name === 'NotReadableError') errorMessage += 'En uso por otra app.';
            
            if (cameraFeed) cameraFeed.innerHTML = `<div class="camera-placeholder-large" style="color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i><p>${errorMessage}</p></div>`;
            if (cameraStatusIcon) cameraStatusIcon.className = 'fas fa-circle red';
            if (cameraStatusText) { 
                cameraStatusText.textContent = 'Error en cámara'; 
                cameraStatusText.style.color = '#e74c3c'; 
            }
            stopAudioAnalysis(); 
        }
    }

    function setupAudioAnalysis(stream) {
        if (audioContext && audioContext.state !== 'closed') { audioContext.close().catch(console.error); }
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            analyser.fftSize = 2048; 
            analyser.smoothingTimeConstant = 0.1; 
            microphone.connect(analyser);
            startVolumeMonitoring();
        } catch (error) {
            console.error('Error audio:', error);
        }
    }

    function startVolumeMonitoring() {
        if (!analyser || !audioContext) return;
        if (volumeAnimationId) cancelAnimationFrame(volumeAnimationId); 
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateVolume = () => {
             if (!analyser || !audioContext) { 
                 if (volumeAnimationId) cancelAnimationFrame(volumeAnimationId); 
                 return; 
             }
            try {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0; 
                dataArray.forEach(v => sum += v);
                const average = dataArray.length > 0 ? sum / dataArray.length : 0; 
                const volumePercent = Math.min(100, Math.max(0, (average / 32) * 100));
                
                if (volumeLevel) {
                    volumeLevel.style.width = volumePercent + '%';
                    volumeLevel.className = 'volume-level';
                    if (volumePercent < 30) volumeLevel.classList.add('low');
                    else if (volumePercent < 70) volumeLevel.classList.add('medium');
                    else volumeLevel.classList.add('high');
                }
                if (volumeText) volumeText.textContent = Math.round(volumePercent) + '%';
                
                volumeAnimationId = requestAnimationFrame(updateVolume);
            } catch (e) { 
                cancelAnimationFrame(volumeAnimationId); 
            }
        };
        volumeAnimationId = requestAnimationFrame(updateVolume); 
    }
    
    function stopAudioAnalysis() {
        if (audioContext) audioContext.close();
        if (volumeAnimationId) cancelAnimationFrame(volumeAnimationId);
        audioContext = null; 
        volumeAnimationId = null;
    }

    function stopCamera() {
        if (stream) stream.getTracks().forEach(track => track.stop()); 
        stream = null; 
        stopAudioAnalysis(); 
    }

    function setupCameraEvents() {
        if (cameraProblemLink) {
            cameraProblemLink.addEventListener('click', e => {
                e.preventDefault();
                showNotification('<strong>Ayuda:</strong> Verifica permisos o reinicia el navegador.', 'alert-warning', 6000); 
            });
        }
        if (restartCameraLink) {
            restartCameraLink.addEventListener('click', e => {
                e.preventDefault();
                initCamera(); 
            });
        }
        if (bathroomLink) {
            bathroomLink.addEventListener('click', (e) => {
                e.preventDefault();
                toggleBathroomBreak();
            });
        }
    }

    // ==========================================
    // 10. EJECUCIÓN Y EVENTOS GLOBALES
    // ==========================================

    // A. Eventos de SEGURIDAD
    if (startSecureBtn) {
        startSecureBtn.addEventListener('click', enableSecureMode);
    }

    // Bloqueo de teclado general (Event fallback)
    document.addEventListener('keydown', blockKeyboard, true);

    // Bloqueo de click derecho (Context Menu)
    document.addEventListener('contextmenu', event => event.preventDefault());

    // Bloqueo de copiar/pegar
    document.addEventListener('copy', e => e.preventDefault());
    document.addEventListener('cut', e => e.preventDefault());
    document.addEventListener('paste', e => e.preventDefault());
    document.addEventListener('selectstart', e => e.preventDefault());

    // Detección de cambio de pestaña
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Detección de pérdida de foco (Anti-Captura / Alt+Tab)
    window.addEventListener('blur', handleFocusLoss);
    window.addEventListener('focus', handleFocusGain);

    // Monitor de Pantalla Completa
    document.addEventListener('fullscreenchange', checkFullScreen);
    document.addEventListener('webkitfullscreenchange', checkFullScreen);

    // B. Limpieza al cerrar
    window.addEventListener('beforeunload', stopCamera);
    
    // C. Configuración de botones de cámara
    setupCameraEvents();

    // NOTA: initExam() NO se llama aquí directamente. 
    // Se llamará cuando el usuario acepte el "Modo Seguro" en enableSecureMode().
});