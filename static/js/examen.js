// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {

    // ==========================================
    // 0. FORMATEO DE TEXTO (Custom Tags)
    // ==========================================
    function formatExamText() {
        const textElements = document.querySelectorAll('.format-text');
        
        textElements.forEach(el => {
            let text = el.innerHTML;
            
            text = text.replace(/\/n/g, '<br>');
            text = text.replace(/\/b([\s\S]*?)b\//g, '<strong>$1</strong>');
            text = text.replace(/\/i([\s\S]*?)i\//g, '<em>$1</em>');
            text = text.replace(/\/u([\s\S]*?)u\//g, '<u>$1</u>');
            text = text.replace(/\/m([\s\S]*?)m\//g, '<mark style="background-color: #f1c40f; color: #333; padding: 0 3px; border-radius: 2px;">$1</mark>');
            text = text.replace(/\/c([\s\S]*?)c\//g, '<div style="text-align: center;">$1</div>');
            text = text.replace(/\/f([\s\S]*?)f\//g, '\\($1\\)');

            el.innerHTML = text;
        });

        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            window.MathJax.typesetPromise().catch((err) => console.log('Error en MathJax: ' + err.message));
        }
    }

    formatExamText();
    
    // ==========================================
    // 1. REFERENCIAS AL DOM
    // ==========================================
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const toggleViewBtn = document.getElementById('toggle-view-btn'); // Botón de visibilidad
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const reviewBtn = document.getElementById('review-btn');
    const finishNavBtn = document.getElementById('finish-nav-btn');
    const countdownElement = document.getElementById('countdown');
    const navItems = document.querySelectorAll('.nav-item');
    const questionContainers = document.querySelectorAll('.question-container');
    const examContainer = document.querySelector('.exam-container');
    
    const cameraFeed = document.getElementById('camera-feed');
    const volumeLevel = document.getElementById('volume-level');
    const volumeText = document.getElementById('volume-text');
    const internetStatusIcon = document.getElementById('internet-status');
    const cameraStatusIcon = document.getElementById('camera-status');
    const micStatusIcon = document.getElementById('mic-status');
    const cameraProblemLink = document.getElementById('camera-problem-link');
    const restartCameraLink = document.getElementById('restart-camera-link');
    const bathroomLink = document.getElementById('bathroom-link');
    const bathroomCountdownElement = document.getElementById('bathroom-countdown');

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
    let timeLeft = window.examConfig.totalSeconds; 
    let answeredQuestions = new Set();
    let reviewQuestions = new Set();
    
    let bathroomCountdownInterval = null;
    let bathroomTimeLeft = 300; 
    let onBathroomBreak = false;
    let bathroomBreakUsed = false;

    let stream = null;
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let volumeAnimationId = null;

    // Estado inicial de vista libre: Visible por defecto para todos los usuarios
    let freeViewMode = true;

    // ==========================================
    // 3. SISTEMA DE SEGURIDAD Y CONEXIÓN
    // ==========================================
    window.addEventListener('online', () => {
        if (internetStatusIcon) internetStatusIcon.classList.add('active');
        showNotification('Conexión a internet restaurada.', 'alert-success', 3000);
    });
    
    window.addEventListener('offline', () => {
        if (internetStatusIcon) internetStatusIcon.classList.remove('active');
        showNotification('Se perdió la conexión a internet. Tus respuestas están a salvo localmente.', 'alert-danger', 5000);
    });

    if (!navigator.onLine && internetStatusIcon) {
        internetStatusIcon.classList.remove('active');
    }

    async function enableSecureMode() {
        const elem = document.documentElement;
        window.isSwitchingToFullscreen = true;

        try {
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen(); 
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen(); 
            }

            if ('keyboard' in navigator && 'lock' in navigator.keyboard) {
                try {
                    await navigator.keyboard.lock(['Escape', 'AltLeft', 'AltRight', 'Tab', 'MetaLeft', 'MetaRight']);
                } catch (e) {
                    console.warn('No se pudo bloquear teclado:', e);
                }
            }

            securityOverlay.style.display = 'none';
            blackoutCurtain.style.display = 'none';
            if (mainContainer) mainContainer.classList.remove('content-blur');

            initExam(); 
            
        } catch (err) {
            console.error(err);
            window.isSwitchingToFullscreen = false;
            alert(`Error: Debes permitir la pantalla completa para realizar el examen.`);
        }

        setTimeout(() => {
            window.isSwitchingToFullscreen = false;
        }, 1000);
    }

    function blockKeyboard(e) {
        if (e.key === 'Escape') return; 

        if (e.key.startsWith('F') || e.ctrlKey || e.altKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    function handleVisibilityChange() {
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
        if (window.isSwitchingToFullscreen) return;
        blackoutCurtain.style.display = 'block';
        if (mainContainer) mainContainer.classList.add('content-blur');
    }

    function handleFocusGain() {
        blackoutCurtain.style.display = 'none';
        if (mainContainer) mainContainer.classList.remove('content-blur');
        window.focus();
    }

    function checkFullScreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            securityOverlay.style.display = 'flex';
            
            if ('keyboard' in navigator && 'unlock' in navigator.keyboard) {
                navigator.keyboard.unlock();
            }

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
            
            document.getElementById('btn-resume-secure').addEventListener('click', () => {
                enableSecureMode(); 
            });
            
            document.getElementById('btn-exit-exam-escape').addEventListener('click', () => {
                 finishExam(); 
            });

        } else {
            securityOverlay.style.display = 'none';
            window.focus();
        }
    }

    // ==========================================
    // 4. GUARDADO AUTOMÁTICO (LOCALSTORAGE)
    // ==========================================
    const uniqueExamId = window.examConfig.examId || 'default';
    const STORAGE_KEY = 'exam_backup_' + window.location.search + '_' + uniqueExamId;

    function saveProgress() {
        const answers = {};
        document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            answers[radio.name] = radio.value;
        });

        const progressData = {
            answers: answers,
            currentQuestion: currentQuestion,
            bathroomBreakUsed: bathroomBreakUsed,
            reviewQuestions: Array.from(reviewQuestions), 
            timestamp: new Date().getTime()
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(progressData));
    }

    function loadProgress() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (!savedData) return;

        try {
            const data = JSON.parse(savedData);
            
            if (typeof data.currentQuestion !== 'undefined') {
                currentQuestion = data.currentQuestion;
            }

            if (data.bathroomBreakUsed) {
                bathroomBreakUsed = true;
                if (bathroomLink) {
                    bathroomLink.textContent = 'Permiso de baño agotado';
                    bathroomLink.style.opacity = '0.6';
                    bathroomLink.style.cursor = 'not-allowed';
                }
            }

            if (data.reviewQuestions && Array.isArray(data.reviewQuestions)) {
                data.reviewQuestions.forEach(qNum => {
                    reviewQuestions.add(qNum); 
                    const statusElement = document.getElementById(`question-status-${qNum}`);
                    const navElement = document.querySelector(`.nav-item[data-question="${qNum}"]`);
                    
                    if (statusElement) {
                        statusElement.textContent = 'Para revisión';
                        statusElement.classList.add('review');
                    }
                    if (navElement) {
                        navElement.classList.add('review');
                        navElement.classList.remove('answered');
                    }
                });
            }

            const answers = data.answers || {};
            let restoredCount = 0;

            for (const [name, value] of Object.entries(answers)) {
                const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
                if (radio) {
                    radio.checked = true;
                    
                    const parentOption = radio.closest('.answer-option');
                    if (parentOption) {
                        parentOption.classList.add('selected-option');
                        parentOption.style.backgroundColor = '#e8f4f8';
                        parentOption.style.borderColor = '#4a90e2';
                        parentOption.style.boxShadow = '0 2px 5px rgba(74, 144, 226, 0.15)';
                    }

                    const qNum = parseInt(name.split('-')[1]);
                    if (!isNaN(qNum)) {
                        answeredQuestions.add(qNum);
                        const statusElement = document.getElementById(`question-status-${qNum}`);
                        const navElement = document.querySelector(`.nav-item[data-question="${qNum}"]`);
                        
                        if (!reviewQuestions.has(qNum)) {
                            if (statusElement) {
                                statusElement.textContent = 'Respondida (Restaurada)';
                                statusElement.classList.add('answered');
                            }
                            if (navElement) {
                                navElement.classList.add('answered');
                            }
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
        loadProgress(); 
        showQuestion(currentQuestion);
        
        if (timeLeft <= 0) {
            if (countdownElement) countdownElement.textContent = "¡Tiempo agotado!";
            showAlert("¡Tiempo Agotado!", "El tiempo del examen ha finalizado según el horario del servidor.", 0)
            .then(() => {
                submitExam();
            });
            return;
        }

        startCountdown();
        setupNavigation();
        setupNavBar();
        setupAnswerEvents();
        setupZoom();
        initCamera(); 
    }

    // ==========================================
    // 6. LÓGICA DE PREGUNTAS Y NAVEGACIÓN
    // ==========================================
    function showQuestion(questionNumber) {
        questionContainers.forEach(container => container.classList.remove('active'));
        const currentQuestionElement = document.querySelector(`.question-container[data-question="${questionNumber}"]`);
        
        if (currentQuestionElement) {
            currentQuestionElement.classList.add('active');

            // Resetear visibilidad de la pregunta original
            const realQuestion = currentQuestionElement.querySelector('.real-question-text');
            const lockedQuestion = currentQuestionElement.querySelector('.locked-question-placeholder');
            if (realQuestion && lockedQuestion) {
                realQuestion.style.display = 'block';
                lockedQuestion.style.display = 'none';
            }

            const answersContainer = currentQuestionElement.querySelector('.answers-container');
            if (answersContainer) {
                answersContainer.querySelectorAll('.answer-option').forEach(opt => {
                    const realContent = opt.querySelector('.real-answer-content');
                    const lockedPlaceholder = opt.querySelector('.locked-answer-placeholder');
                    
                    // Renderizado inteligente basado en la variable de vista libre
                    if (freeViewMode) {
                        if (realContent) realContent.style.display = 'block';
                        if (lockedPlaceholder) lockedPlaceholder.style.display = 'none';
                    } else {
                        if (realContent) realContent.style.display = 'none';
                        if (lockedPlaceholder) lockedPlaceholder.style.display = 'inline-flex';
                    }
                });
            }
        }
        
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
            } else if (currentQuestion === totalQuestions) {
                finishExam();
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
        // A. Manejador para el cambio nativo de los botones de opción radio
        document.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', function() {
                const questionNumber = parseInt(this.name.split('-')[1]);
                if (isNaN(questionNumber)) return;
                
                const container = this.closest('.answers-container');
                if (container) {
                    container.querySelectorAll('.answer-option').forEach(opt => {
                        opt.classList.remove('selected-option');
                        opt.style.backgroundColor = '#f8f9fa';
                        opt.style.borderColor = '#e9ecef';
                        opt.style.boxShadow = 'none';
                    });
                }
                
                const selectedOption = this.closest('.answer-option');
                if (selectedOption && this.checked) {
                    selectedOption.classList.add('selected-option');
                    selectedOption.style.backgroundColor = '#e8f4f8';
                    selectedOption.style.borderColor = '#4a90e2';
                    selectedOption.style.boxShadow = '0 2px 5px rgba(74, 144, 226, 0.15)';
                }
                
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

        // B. Mecanismo de Bloqueo/Desbloqueo al hacer clic en un contenedor de respuesta
        document.querySelectorAll('.answer-option').forEach(option => {
            option.addEventListener('click', function(e) {
                const lockedPlaceholder = this.querySelector('.locked-answer-placeholder');
                const isLocked = lockedPlaceholder && window.getComputedStyle(lockedPlaceholder).display !== 'none';

                if (isLocked) {
                    // Primer clic: Bloqueamos el comportamiento por defecto (no seleccionar radio)
                    e.preventDefault();

                    // Bloquear la pregunta
                    const qContainer = this.closest('.question-container');
                    if (qContainer) {
                        const realQuestion = qContainer.querySelector('.real-question-text');
                        const lockedQuestion = qContainer.querySelector('.locked-question-placeholder');
                        if (realQuestion && lockedQuestion) {
                            realQuestion.style.display = 'none';
                            lockedQuestion.style.display = 'block';
                        }
                    }

                    // Desbloquear esta opción y bloquear las demás
                    const container = this.closest('.answers-container');
                    if (container) {
                        container.querySelectorAll('.answer-option').forEach(opt => {
                            const realContent = opt.querySelector('.real-answer-content');
                            const lockedPh = opt.querySelector('.locked-answer-placeholder');
                            
                            if (opt === this) {
                                if (realContent) realContent.style.display = 'block';
                                if (lockedPh) lockedPh.style.display = 'none';
                            } else {
                                if (realContent) realContent.style.display = 'none';
                                if (lockedPh) lockedPh.style.display = 'inline-flex';
                            }
                        });
                    }
                } else {
                    // Ya está desbloqueada (segundo clic). Permitir seleccionar.
                    if (e.target.tagName.toLowerCase() !== 'input') {
                        const radio = this.querySelector('input[type="radio"]');
                        if (radio && !radio.checked) {
                            radio.checked = true;
                            radio.dispatchEvent(new Event('change'));
                        }
                    }
                }
            });
        });

        // C. Evento inverso para restaurar la pregunta
        document.querySelectorAll('.locked-question-placeholder').forEach(block => {
            block.addEventListener('click', function(e) {
                e.preventDefault();
                const qContainer = this.closest('.question-container');
                if (!qContainer) return;

                const realQuestion = qContainer.querySelector('.real-question-text');
                if (realQuestion) {
                    realQuestion.style.display = 'block';
                    this.style.display = 'none';
                }

                const answersContainer = qContainer.querySelector('.answers-container');
                if (answersContainer) {
                    answersContainer.querySelectorAll('.answer-option').forEach(opt => {
                        const realContent = opt.querySelector('.real-answer-content');
                        const lockedPlaceholder = opt.querySelector('.locked-answer-placeholder');
                        if (realContent) realContent.style.display = 'none';
                        if (lockedPlaceholder) lockedPlaceholder.style.display = 'inline-flex';
                    });
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
        if (currentQuestion === 0) {
            prevBtn.style.display = 'none';
            reviewBtn.style.display = 'none';
        } else {
            prevBtn.style.display = ''; 
            reviewBtn.style.display = '';
        }

        prevBtn.disabled = currentQuestion === 0;
        prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
        prevBtn.style.cursor = prevBtn.disabled ? 'not-allowed' : 'pointer';
        
        reviewBtn.disabled = (currentQuestion === 0 || currentQuestion > totalQuestions);
        reviewBtn.style.opacity = reviewBtn.disabled ? '0.5' : '1';
        reviewBtn.style.cursor = reviewBtn.disabled ? 'not-allowed' : 'pointer';
        
        if (currentQuestion === totalQuestions && totalQuestions > 0) {
            nextBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR';
            nextBtn.style.backgroundColor = '#27ae60'; 
            nextBtn.style.color = 'white';
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
        } else {
            nextBtn.innerHTML = 'SIGUIENTE <i class="fas fa-chevron-right"></i>';
            nextBtn.style.backgroundColor = ''; 
            nextBtn.style.color = ''; 
            
            nextBtn.disabled = currentQuestion > totalQuestions;
            nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
            nextBtn.style.cursor = nextBtn.disabled ? 'not-allowed' : 'pointer';
        }
    }

    // ==========================================
    // 6.5. MODALES PERSONALIZADOS
    // ==========================================
    function showConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            document.getElementById('confirm-modal-title').innerHTML = `<i class="fas fa-question-circle"></i> ${title}`;
            document.getElementById('confirm-modal-message').innerHTML = message;
            modal.style.display = 'flex'; 

            const btnOk = document.getElementById('confirm-modal-ok');
            const btnCancel = document.getElementById('confirm-modal-cancel');

            const cleanup = () => {
                btnOk.replaceWith(btnOk.cloneNode(true));
                btnCancel.replaceWith(btnCancel.cloneNode(true));
                modal.style.display = 'none';
            };

            document.getElementById('confirm-modal-ok').addEventListener('click', () => {
                cleanup(); resolve(true);
            });
            document.getElementById('confirm-modal-cancel').addEventListener('click', () => {
                cleanup(); resolve(false);
            });
        });
    }

    function showAlert(title, message, countdownSeconds = 0) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-alert-modal');
            document.getElementById('alert-modal-title').innerHTML = title.includes("Error") || title.includes("Agotado") ? `<i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i> ${title}` : `<i class="fas fa-check-circle" style="color: #27ae60;"></i> ${title}`;
            document.getElementById('alert-modal-message').innerHTML = message;
            
            const btnOk = document.getElementById('alert-modal-ok');
            const countdownEl = document.getElementById('alert-modal-countdown');
            modal.style.display = 'flex';

            if (countdownSeconds > 0) {
                btnOk.style.display = 'none';
                countdownEl.style.display = 'block';
                countdownEl.textContent = countdownSeconds;
                
                let secondsLeft = countdownSeconds;
                const interval = setInterval(() => {
                    secondsLeft--;
                    countdownEl.textContent = secondsLeft;
                    if (secondsLeft <= 0) {
                        clearInterval(interval);
                        modal.style.display = 'none';
                        resolve(); 
                    }
                }, 1000);
            } else {
                btnOk.style.display = 'inline-flex';
                countdownEl.style.display = 'none';
                
                const cleanup = () => {
                    btnOk.replaceWith(btnOk.cloneNode(true));
                    modal.style.display = 'none';
                };
                document.getElementById('alert-modal-ok').addEventListener('click', () => {
                    cleanup(); resolve();
                });
            }
        });
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
                saveProgress(); 
            }

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                updateDisplay();
                if (countdownElement) countdownElement.textContent = "¡Tiempo agotado!";
                
                showAlert("¡Tiempo Agotado!", "El tiempo de tu examen ha finalizado. Tus respuestas se enviarán automáticamente.", 0)
                .then(() => {
                    submitExam();
                });
                return;
            }
            updateDisplay();
        }, 1000);
    }

    async function finishExam() {
        saveProgress();

        const unanswered = totalQuestions - answeredQuestions.size;
        const msg = unanswered > 0 
            ? `Tienes <strong>${unanswered}</strong> pregunta(s) sin responder.<br><br>¿Seguro que deseas finalizar?` 
            : '¿Seguro que deseas finalizar el examen de forma anticipada?';
        
        const confirmed = await showConfirm("Finalizar Examen", msg);
        
        if (confirmed) {
            submitExam();
        }
    }

    function submitExam() {
        console.log('Enviando examen...');
        
        document.getElementById('custom-alert-modal').style.display = 'flex';
        document.getElementById('alert-modal-title').innerHTML = `<i class="fas fa-spinner fa-spin"></i> Guardando`;
        document.getElementById('alert-modal-message').innerHTML = 'Por favor espera...';
        document.getElementById('alert-modal-ok').style.display = 'none';
        document.getElementById('alert-modal-countdown').style.display = 'none';
        
        const respuestas = {};
        document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
            const name = radio.name; 
            const questionNumber = name.split('-')[1]; 
            respuestas[questionNumber] = radio.value;
        });

        fetch('/api/save-exam-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folio: window.examConfig.folio,
                curso: window.examConfig.curso,
                materia: window.examConfig.materia,
                respuestas: respuestas
            })
        })
        .then(response => response.json())
        .then(data => {
            document.getElementById('custom-alert-modal').style.display = 'none';

            if (data.success) {
                clearProgress();
                stopCamera();
                
                showAlert("¡Examen Terminado!", "Resultados enviados correctamente. Redirigiendo al inicio...", 5)
                .then(() => {
                    window.location.href = '/launcher';
                });

            } else {
                console.error('Error al guardar resultados:', data.message);
                showConfirm("Error al Guardar", "Ocurrió un error al guardar los resultados. ¿Quieres intentar enviar de nuevo?")
                .then((retry) => {
                    if (retry) {
                        submitExam();
                    } else {
                        clearProgress();
                        stopCamera();
                        showAlert("Aviso", "Examen finalizado, pero hubo problemas. Contacta a tu administrador.", 3)
                        .then(() => { window.location.href = '/launcher'; });
                    }
                });
            }
        })
        .catch(error => {
            document.getElementById('custom-alert-modal').style.display = 'none';
            console.error('Error al enviar resultados:', error);
            showConfirm("Error de Conexión", "No se pudo conectar con el servidor. ¿Quieres intentar enviar de nuevo?")
            .then((retry) => {
                if (retry) {
                    submitExam();
                } else {
                    clearProgress();
                    stopCamera();
                    showAlert("Aviso", "Examen finalizado sin conexión. Contacta a tu administrador.", 3)
                    .then(() => { window.location.href = '/launcher'; });
                }
            });
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
            onBathroomBreak = false;
            bathroomLink.textContent = 'Permiso de baño utilizado'; 
            bathroomLink.style.opacity = '0.6';
            bathroomLink.style.cursor = 'not-allowed';
            
            stopBathroomCountdown();
            showNotification('Has regresado del baño. Continúa tu examen.', 'alert-info', 3000);
            saveProgress(); 
        } else {
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
            
            if (cameraStatusIcon) cameraStatusIcon.classList.add('active');
            if (micStatusIcon) micStatusIcon.classList.add('active');
            
        } catch (error) {
            console.error('Error cámara:', error);
            let errorMessage = 'No se pudo acceder. ';
            
            if (error.name === 'NotAllowedError') errorMessage += 'Permisos denegados.';
            else if (error.name === 'NotFoundError') errorMessage += 'No se encontró cámara.';
            else if (error.name === 'NotReadableError') errorMessage += 'En uso por otra app.';
            
            if (cameraFeed) cameraFeed.innerHTML = `<div class="camera-placeholder-large" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i><p>${errorMessage}</p></div>`;
            
            if (cameraStatusIcon) cameraStatusIcon.classList.remove('active');
            if (micStatusIcon) micStatusIcon.classList.remove('active');
            
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
    
    // El botón Toggle ahora está disponible para todos los usuarios
    if (toggleViewBtn) {
        toggleViewBtn.style.display = 'flex'; 
        
        if (freeViewMode) {
            toggleViewBtn.classList.add('active');
        }
        
        toggleViewBtn.addEventListener('click', () => {
            freeViewMode = !freeViewMode; // Invertir el estado
            
            if (freeViewMode) {
                toggleViewBtn.classList.add('active');
                toggleViewBtn.innerHTML = '<i class="fas fa-eye"></i>';
                showNotification('Vista libre activada (Preguntas visibles).', 'alert-success', 3000);
            } else {
                toggleViewBtn.classList.remove('active');
                toggleViewBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
                showNotification('Vista oculta activada (Con candados).', 'alert-info', 3000);
            }
            
            // Forzar refresco visual inmediato de la pregunta en pantalla con el modo seleccionado
            showQuestion(currentQuestion);
        });
    }

    if (window.examConfig.isAdmin) {
        if (securityOverlay) securityOverlay.style.display = 'none';
        if (blackoutCurtain) blackoutCurtain.style.display = 'none';
        if (mainContainer) mainContainer.classList.remove('content-blur');
        
        console.log("Modo Admin detectado: Seguridad y bloqueos desactivados.");
        
        initExam(); 
        
    } else {
        if (startSecureBtn) {
            startSecureBtn.addEventListener('click', enableSecureMode);
        }

        document.addEventListener('keydown', blockKeyboard, true);
        document.addEventListener('contextmenu', event => event.preventDefault());

        document.addEventListener('copy', e => e.preventDefault());
        document.addEventListener('cut', e => e.preventDefault());
        document.addEventListener('paste', e => e.preventDefault());
        document.addEventListener('selectstart', e => e.preventDefault());

        document.addEventListener('visibilitychange', handleVisibilityChange);

        window.addEventListener('blur', handleFocusLoss);
        window.addEventListener('focus', handleFocusGain);

        document.addEventListener('fullscreenchange', checkFullScreen);
        document.addEventListener('webkitfullscreenchange', checkFullScreen);
    }

    window.addEventListener('beforeunload', stopCamera);
    setupCameraEvents();
});