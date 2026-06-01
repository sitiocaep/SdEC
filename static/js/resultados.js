document.addEventListener('DOMContentLoaded', function() {
    let materiaActual = window.resultsConfig.materia;
    let globalQuestions = [];
    let currentFilter = 'all';

    // ==========================================
    // 1. BASE DE DATOS EN MEMORIA RAM
    // ==========================================
    let masterExamCache = null; 

    // ==========================================
    // 2. DESCARGA MASIVA INICIAL (BULK LOAD)
    // ==========================================
    function loadAllData() {
        const navContainer = document.getElementById('questions-nav');
        
        navContainer.innerHTML = '<div class="loading-spinner" style="width:100%; text-align:center;"><i class="fas fa-database fa-spin" style="margin-right:8px;"></i> Descargando resultados en memoria, por favor espera...</div>';
        
        fetch('/api/get-all-results-bulk')
            .then(res => res.json())
            .then(resData => {
                if(resData.success) {
                    masterExamCache = resData.data;
                    navContainer.innerHTML = '<div style="padding: 15px; color: #7f8c8d; font-weight: 500; text-align:center;">Base de datos cargada. Selecciona un examen para ver los detalles.</div>';
                    
                    if (!window.resultsConfig.isAdmin && materiaActual) {
                        renderFromCache('', '', materiaActual);
                    }
                } else {
                    throw new Error(resData.message || "Error al descargar la base de datos.");
                }
            })
            .catch(err => {
                console.error("Error en Bulk Load:", err);
                navContainer.innerHTML = `<div style="color:#e74c3c; text-align:center; font-weight:bold; padding:20px;">
                    <i class="fas fa-exclamation-triangle"></i> Error de conexión con el servidor. Intenta recargar la página.
                </div>`;
            });
    }

    loadAllData(); 

    // ==========================================
    // 3. LÓGICA DE MENÚ EN CASCADA (ADMIN)
    // ==========================================
    if (window.resultsConfig.isAdmin && window.resultsConfig.adminData) {
        const adminData = window.resultsConfig.adminData;
        const cursoSel = document.getElementById('admin-curso-select');
        const materiaSel = document.getElementById('admin-materia-select');
        const userSel = document.getElementById('admin-user-select');

        Object.keys(adminData).forEach(curso => {
            cursoSel.add(new Option(curso, curso));
        });

        cursoSel.addEventListener('change', function() {
            materiaSel.innerHTML = '<option value="">-- Selecciona Materia --</option>';
            userSel.innerHTML = '<option value="">-- Selecciona Usuario --</option>';
            materiaSel.disabled = true;
            userSel.disabled = true;

            const selectedCurso = this.value;
            if (selectedCurso && adminData[selectedCurso]) {
                adminData[selectedCurso].materias.forEach(m => {
                    materiaSel.add(new Option(m, m));
                });
                materiaSel.disabled = false;
            }
        });

        materiaSel.addEventListener('change', function() {
            userSel.innerHTML = '<option value="">-- Selecciona Usuario --</option>';
            userSel.disabled = true;

            const selectedCurso = cursoSel.value;
            if (this.value && selectedCurso) {
                adminData[selectedCurso].usuarios.forEach(u => {
                    userSel.add(new Option(u.nombre_completo, u.folio));
                });
                userSel.disabled = false;
            }
        });

        userSel.addEventListener('change', function() {
            const folio = this.value;
            if (!folio) return; 

            const curso = cursoSel.value;
            materiaActual = materiaSel.value; 

            const titleEl = document.getElementById('materia-title');
            if (titleEl) titleEl.textContent = materiaActual;
            
            currentFilter = 'all';
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
            document.querySelector('.filter-btn.total').classList.add('active-filter');

            renderFromCache(folio, curso, materiaActual);
        });
    }

    // ==========================================
    // 4. LÓGICA DE LOS BOTONES DE ACCIÓN
    // ==========================================
    const btnShowDetails = document.getElementById('btn-show-details');
    const detailsPanel = document.getElementById('details-panel-container');

    // Funcionalidad de Interruptor (Abrir / Cerrar) para Revisión Detallada
    if (btnShowDetails && detailsPanel) {
        btnShowDetails.addEventListener('click', function() {
            if (detailsPanel.style.display === 'none') {
                detailsPanel.style.display = 'flex'; 
                setTimeout(() => {
                    detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
                this.innerHTML = '<i class="fas fa-search-minus"></i> Ocultar revisión';
            } else {
                detailsPanel.style.display = 'none';
                this.innerHTML = '<i class="fas fa-search-plus"></i> Revisión detallada';
            }
        });
    }

    const btnChangeExam = document.getElementById('btn-change-exam');
    if (btnChangeExam) {
        btnChangeExam.addEventListener('click', function() {
            window.location.href = '/launcher';
        });
    }

    const btnRetry = document.getElementById('btn-retry');
    if (btnRetry) {
        btnRetry.addEventListener('click', function() {
            // Reservado para futura lógica
        });
    }

    // BOTÓN: VER TODOS LOS RESULTADOS (GLOBAL)
    const btnAllResults = document.getElementById('btn-all-results');
    if (btnAllResults) {
        btnAllResults.addEventListener('click', function() {
            if (!masterExamCache) return;

            let targetData = window.resultsConfig.isAdmin 
                ? masterExamCache[document.getElementById('admin-user-select').value] 
                : masterExamCache;

            if (!targetData || Object.keys(targetData).length === 0) {
                alert("No hay suficientes resultados registrados para mostrar un reporte global.");
                return;
            }

            let globalSummary = { total: 0, correctas: 0, incorrectas: 0, sin_responder: 0, calificacion: 0 };
            
            // Construir Desglose en el contenedor superior (Tarjetas clickeables)
            let breakdownHtml = `
                <div style="border-top: 2px dashed #e2e8f0; padding-top: 15px; margin-top: 15px; border-bottom: 2px solid #f1f3f5; padding-bottom: 20px;">
                    <h4 style="color: #7f8c8d; font-size: 13px; text-transform: uppercase; text-align: center; margin-bottom: 12px; letter-spacing: 1px;">
                        Selecciona una materia para revisar sus preguntas
                    </h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">
            `;

            Object.keys(targetData).forEach(materiaKey => {
                const matData = targetData[materiaKey];
                if (matData && matData.details) {
                    
                    globalSummary.total += matData.summary.total;
                    globalSummary.correctas += matData.summary.correctas;
                    globalSummary.incorrectas += matData.summary.incorrectas;
                    globalSummary.sin_responder += matData.summary.sin_responder;

                    let cardColor = matData.summary.calificacion >= 6 ? '#27ae60' : '#e74c3c';
                    
                    // Tarjeta interactiva de la materia
                    breakdownHtml += `
                        <div class="global-subject-card" data-materia="${materiaKey}" style="cursor: pointer; flex: 1; min-width: 130px; background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: all 0.2s;">
                            <div style="font-size: 11px; font-weight: 700; color: #7f8c8d; text-transform: uppercase; margin-bottom: 5px;">${materiaKey}</div>
                            <div style="font-size: 18px; font-weight: 800; color: #2c3e50;">${matData.summary.correctas} <span style="font-size: 12px; color: #bdc3c7; font-weight: 600;">/ ${matData.summary.total}</span></div>
                            <div style="font-size: 11px; font-weight: 600; color: ${cardColor}; margin-top: 4px;">Calf: ${matData.summary.calificacion}</div>
                            <div style="margin-top: 8px; font-size: 10px; color: #4a90e2; font-weight: 700;"><i class="fas fa-search"></i> Explorar</div>
                        </div>
                    `;
                }
            });

            breakdownHtml += `</div></div>`;
            
            const breakdownContainer = document.getElementById('top-breakdown-container');
            breakdownContainer.innerHTML = breakdownHtml;
            breakdownContainer.style.display = 'block';

            // Agregar eventos Hover y Click a las tarjetas
            document.querySelectorAll('.global-subject-card').forEach(card => {
                card.addEventListener('mouseover', function() {
                    this.style.transform = 'translateY(-3px)';
                    this.style.boxShadow = '0 6px 12px rgba(0,0,0,0.1)';
                    this.style.borderColor = '#4a90e2';
                });
                card.addEventListener('mouseout', function() {
                    this.style.transform = 'none';
                    this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                    this.style.borderColor = '#e9ecef';
                });
                card.addEventListener('click', function() {
                    const matKey = this.getAttribute('data-materia');
                    loadGlobalSubjectDetails(matKey);
                });
            });

            globalSummary.calificacion = globalSummary.total > 0 
                ? ((globalSummary.correctas / globalSummary.total) * 10).toFixed(1) 
                : 0.0;

            const titleEl = document.getElementById('materia-title');
            if (titleEl) titleEl.textContent = "RENDIMIENTO GLOBAL";
            materiaActual = "GLOBAL"; 

            // Actualizar etiqueta de posición a GLOBAL
            const positionTitle = document.getElementById('position-title');
            if (positionTitle) positionTitle.textContent = "Posición Global";

            renderSummary(globalSummary);
            
            // Ocultar y deshabilitar el botón de revisión hasta que toquen una tarjeta
            if (detailsPanel) detailsPanel.style.display = 'none';
            if (btnShowDetails) {
                btnShowDetails.disabled = true;
                btnShowDetails.innerHTML = '<i class="fas fa-search-plus"></i> Revisión detallada';
            }
        });
    }

    // ==========================================
    // FUNCIÓN: CARGAR DETALLES AL TOCAR TARJETA DE MATERIA
    // ==========================================
    function loadGlobalSubjectDetails(matKey) {
        let targetData = window.resultsConfig.isAdmin 
            ? masterExamCache[document.getElementById('admin-user-select').value] 
            : masterExamCache;

        let subjectData = targetData[matKey];
        if(!subjectData) return;

        // 1. Ocultar el desglose de tarjetas para enfocarnos en la materia elegida
        const breakdownContainer = document.getElementById('top-breakdown-container');
        if (breakdownContainer) {
            breakdownContainer.style.display = 'none';
        }

        // 2. Actualizar el título principal a la materia
        const titleEl = document.getElementById('materia-title');
        if (titleEl) titleEl.textContent = matKey;

        // Regresar el título de "Posición" a su estado original
        const positionTitle = document.getElementById('position-title');
        if (positionTitle) positionTitle.textContent = "Posición";

        // Registrar el estado actual
        materiaActual = matKey; 

        // 3. Ajustar estadísticas (Aciertos y Score) a la materia seleccionada
        renderSummary(subjectData.summary);

        // 4. Cargar EXCLUSIVAMENTE las preguntas de esta materia
        globalQuestions = subjectData.details.map((q, idx) => ({ ...q, materia_origen: matKey, originalIndex: idx }));

        // 5. Reiniciar Filtros a "Total"
        currentFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
        const totalFilterBtn = document.querySelector('.filter-btn.total');
        if(totalFilterBtn) totalFilterBtn.classList.add('active-filter');

        renderNavigation();

        // 6. Habilitar el botón de revisión PERO NO abrirlo automáticamente
        if (btnShowDetails) {
            btnShowDetails.disabled = false;
            if (detailsPanel) detailsPanel.style.display = 'none'; // Aseguramos que se mantenga oculto
            btnShowDetails.innerHTML = '<i class="fas fa-search-plus"></i> Revisión detallada'; // Texto de abrir
        }
    }

    // ==========================================
    // 5. RENDERIZADO DESDE MEMORIA RAM (Individual Clásico)
    // ==========================================
    function renderFromCache(folio = '', curso = '', reqMateria = '') {
        const matToFetch = reqMateria || materiaActual;
        
        if (!matToFetch || !masterExamCache) return; 

        document.getElementById('single-question-container').innerHTML = '';
        
        // Limpiar y ocultar el desglose global si se seleccionó individualmente
        const breakdownContainer = document.getElementById('top-breakdown-container');
        if (breakdownContainer) {
            breakdownContainer.innerHTML = '';
            breakdownContainer.style.display = 'none';
        }
        
        const positionTitle = document.getElementById('position-title');
        if (positionTitle) positionTitle.textContent = "Posición";

        let dataToRender = null;

        if (window.resultsConfig.isAdmin) {
            if (masterExamCache[folio] && masterExamCache[folio][matToFetch]) {
                dataToRender = masterExamCache[folio][matToFetch];
            }
        } else {
            if (masterExamCache[matToFetch]) {
                dataToRender = masterExamCache[matToFetch];
            }
        }

        if (dataToRender && dataToRender.details) {
            globalQuestions = dataToRender.details.map((q, idx) => ({ ...q, materia_origen: matToFetch, originalIndex: idx }));
            renderSummary(dataToRender.summary);
            setupFilters();
            renderNavigation(); 
            
            // Estado base de la revisión
            if(btnShowDetails) {
                btnShowDetails.disabled = false;
                if(detailsPanel) detailsPanel.style.display = 'none';
                btnShowDetails.innerHTML = '<i class="fas fa-search-plus"></i> Revisión detallada';
            }
        } else {
            document.getElementById('questions-nav').innerHTML = '';
            document.getElementById('single-question-container').innerHTML = `
                <div style="text-align:center; color:#e74c3c; padding:30px; font-weight: bold; font-size: 16px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; display: block; margin-bottom: 10px;"></i> 
                    No hay resultados registrados para este examen.
                </div>`;
            renderSummary({calificacion: 0, total: 0, correctas: 0, incorrectas: 0, sin_responder: 0});
            if(btnShowDetails) btnShowDetails.disabled = true;
        }
    }

    function renderSummary(summary) {
        document.getElementById('score-number').textContent = summary.calificacion;
        document.getElementById('count-total').textContent = summary.total;
        document.getElementById('count-correct').textContent = summary.correctas;
        document.getElementById('count-incorrect').textContent = summary.incorrectas;
        document.getElementById('count-unanswered').textContent = summary.sin_responder;
        document.getElementById('top-aciertos').textContent = `${summary.correctas} / ${summary.total}`;

        const analisisTextEl = document.getElementById('analysis-text');
        if (summary.total > 0) {
            const porcentaje = (summary.correctas / summary.total) * 100;
            if (porcentaje >= 85) {
                analisisTextEl.innerHTML = "<strong>¡Excelente trabajo!</strong> Has demostrado un sólido dominio de los temas.";
            } else if (porcentaje >= 60) {
                analisisTextEl.innerHTML = "<strong>Buen desempeño</strong>, pero te sugerimos revisar las preguntas incorrectas para reforzar.";
            } else {
                analisisTextEl.innerHTML = "<strong>Requiere refuerzo.</strong> Usa la revisión detallada para analizar los temas de mayor dificultad.";
            }
        } else {
            analisisTextEl.innerHTML = "Sin datos para analizar.";
        }
    }

    function setupFilters() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', function() {
                // Alerta si toca filtros en modo Global sin haber seleccionado materia
                if (btnShowDetails.disabled) {
                    alert("Por favor, selecciona primero una materia del desglose superior para ver su revisión.");
                    return;
                }

                if (detailsPanel.style.display === 'none') {
                    btnShowDetails.click();
                }
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
                this.classList.add('active-filter');
                currentFilter = this.getAttribute('data-filter');
                renderNavigation();
            });
        });
    }

    function renderNavigation() {
        const navContainer = document.getElementById('questions-nav');
        navContainer.innerHTML = ''; 
        
        const filteredQuestions = globalQuestions.filter(q => currentFilter === 'all' || q.status === currentFilter);

        if (filteredQuestions.length === 0) {
            navContainer.style.display = 'flex';
            navContainer.innerHTML = '<div style="color:#7f8c8d; padding:15px; width: 100%; text-align: center; font-weight: 600;">No hay preguntas en esta categoría.</div>';
            document.getElementById('single-question-container').innerHTML = '';
            return;
        }

        if (materiaActual === 'GLOBAL') {
            navContainer.style.display = 'block'; 
            
            const grouped = {};
            filteredQuestions.forEach(q => {
                if (!grouped[q.materia_origen]) grouped[q.materia_origen] = [];
                grouped[q.materia_origen].push(q);
            });

            Object.keys(grouped).forEach(matKey => {
                const header = document.createElement('div');
                header.style.backgroundColor = '#f1f5f9';
                header.style.color = '#334155';
                header.style.padding = '8px 15px';
                header.style.marginBottom = '10px';
                header.style.marginTop = '10px';
                header.style.borderRadius = '6px';
                header.style.fontWeight = '700';
                header.style.fontSize = '14px';
                header.style.textTransform = 'uppercase';
                header.style.borderLeft = '4px solid #4a90e2';
                header.innerHTML = `<i class="fas fa-bookmark" style="margin-right: 6px; color: #4a90e2;"></i> ${matKey}`;
                navContainer.appendChild(header);

                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.flexWrap = 'wrap';
                btnContainer.style.gap = '8px';
                btnContainer.style.marginBottom = '20px';

                grouped[matKey].forEach(item => {
                    const btn = document.createElement('div');
                    let statusClass = 'unanswered';
                    if(item.status === 'correcta') statusClass = 'correct';
                    if(item.status === 'incorrecta') statusClass = 'incorrect';

                    btn.className = `nav-item ${statusClass}`;
                    btn.textContent = item.numero;
                    btn.onclick = () => showQuestion(item.originalIndex);
                    btn.setAttribute('data-target-index', item.originalIndex);
                    btnContainer.appendChild(btn);
                });
                navContainer.appendChild(btnContainer);
            });
        } else {
            navContainer.style.display = 'flex'; 
            filteredQuestions.forEach((item) => {
                const btn = document.createElement('div');
                let statusClass = 'unanswered';
                if(item.status === 'correcta') statusClass = 'correct';
                if(item.status === 'incorrecta') statusClass = 'incorrect';

                btn.className = `nav-item ${statusClass}`;
                btn.textContent = item.numero;
                btn.onclick = () => showQuestion(item.originalIndex);
                btn.setAttribute('data-target-index', item.originalIndex);
                
                navContainer.appendChild(btn);
            });
        }

        if (filteredQuestions.length > 0) {
            showQuestion(filteredQuestions[0].originalIndex);
        }
    }

    // ==========================================
    // 7. RENDERIZADO Y FORMATO DE LA PREGUNTA
    // ==========================================
    function showQuestion(originalIndex) {
        const navButtons = document.querySelectorAll('.nav-item');
        navButtons.forEach(btn => {
            if(parseInt(btn.getAttribute('data-target-index')) === originalIndex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const item = globalQuestions[originalIndex];
        const container = document.getElementById('single-question-container');

        let statusText = '';
        if (item.status === 'correcta') statusText = '<span style="color:#27ae60"><i class="fas fa-check-circle"></i> Respondida Correctamente</span>';
        else if (item.status === 'incorrecta') statusText = '<span style="color:#e74c3c"><i class="fas fa-times-circle"></i> Respondida Incorrectamente</span>';
        else statusText = '<span style="color:#f39c12"><i class="fas fa-minus-circle"></i> No se respondió</span>';

        let headerMateriaContext = '';
        if (materiaActual === 'GLOBAL' && item.materia_origen) {
            headerMateriaContext = `<span style="color: #4a90e2; font-weight: 800;"> - ${item.materia_origen.toUpperCase()}</span>`;
        }

        let html = `
            <div class="question-text" style="background-color: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
                <div class="q-header">
                    <span>PREGUNTA ${item.numero} ${headerMateriaContext}</span>
                    <span>${statusText}</span>
                </div>
                <p style="margin-bottom: 15px;">
                    <strong>${item.numero}.</strong> <span class="format-text">${item.pregunta}</span>
                </p>
        `;

        if (item.Parrfafo && String(item.Parrfafo).trim() !== '' && String(item.Parrfafo).toLowerCase() !== 'nan') {
            html += `
                <p style="text-align: justify; margin-bottom: 15px; font-weight: normal; font-size: 0.95em; color: #444;">
                    <span class="format-text">${item.Parrfafo}</span>
                </p>
            `;
        }

        if (item.Img_Parrafo && String(item.Img_Parrafo).trim() !== '' && String(item.Img_Parrafo).toLowerCase() !== 'nan') {
            html += `
                <div style="text-align: center; margin-bottom: 15px;">
                    <img src="/static/img/preguntas/${String(item.Img_Parrafo).trim()}" alt="Imagen de apoyo" style="max-width: 100%; height: auto; border: 1px solid #ddd; padding: 5px; border-radius: 4px; display: inline-block; background-color: white;">
                </div>
            `;
        }

        if (item.Pregunta_Parrafo && String(item.Pregunta_Parrafo).trim() !== '' && String(item.Pregunta_Parrafo).toLowerCase() !== 'nan') {
            html += `
                <p style="margin-bottom: 0; font-weight: normal; color: #2c3e50;">
                    <span class="format-text">${item.Pregunta_Parrafo}</span>
                </p>
            `;
        }

        html += `</div><div class="options-grid">`;

        ['A', 'B', 'C', 'D'].forEach(optKey => {
            const optText = item.opciones[optKey];
            if (!optText) return; 

            const imgKey = 'Img_Respuesta_' + optKey.toLowerCase();
            const optImg = item[imgKey];

            let rowClass = 'option-row';
            let icon = optKey;

            if (item.correcta === optKey) {
                rowClass += ' correct-answer';
                icon = '<i class="fas fa-check"></i>';
            }
            
            if (item.seleccionada === optKey && item.seleccionada !== item.correcta) {
                rowClass += ' user-selected';
                icon = '<i class="fas fa-times"></i>';
            } else if (item.seleccionada === optKey && item.seleccionada === item.correcta) {
                icon = '<i class="fas fa-check-double"></i>';
            }

            html += `
                <div class="${rowClass}" style="display: flex; align-items: flex-start; margin-bottom: 12px; padding: 15px;">
                    <div class="option-icon" style="margin-top: 2px;">${icon}</div>
                    <div style="width: 100%;">
                        <div style="line-height: 1.5;"><span class="format-text">${optText}</span></div>
            `;

            if (optImg && String(optImg).trim() !== '' && String(optImg).toLowerCase() !== 'nan') {
                html += `
                        <div style="margin-top: 10px; text-align: left;">
                            <img src="/static/img/preguntas/${String(optImg).trim()}" alt="Opción ${optKey}" style="max-width: 100%; max-height: 150px; height: auto; border-radius: 4px; border: 1px solid #ddd; padding: 3px;">
                        </div>
                `;
            }

            html += `</div></div>`;
        });

        html += `</div>`; 
        container.innerHTML = html;
        formatExamText(container);
    }

    // ==========================================
    // 8. FUNCIÓN DE REEMPLAZO DE ETIQUETAS
    // ==========================================
    function formatExamText(containerElement) {
        const textElements = containerElement.querySelectorAll('.format-text');
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
            window.MathJax.typesetPromise([containerElement]).catch((err) => console.log('Error en MathJax: ' + err.message));
        }
    }
});