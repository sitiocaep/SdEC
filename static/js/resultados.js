document.addEventListener('DOMContentLoaded', function() {
    let materiaActual = window.resultsConfig.materia;
    const chartCtx = document.getElementById('resultsChart').getContext('2d');
    
    let currentChart = null; 
    let globalQuestions = [];
    let currentFilter = 'all';

    // ==========================================
    // 1. LÓGICA DE MENÚ EN CASCADA (ADMIN)
    // ==========================================
    if (window.resultsConfig.isAdmin && window.resultsConfig.adminData) {
        const adminData = window.resultsConfig.adminData;
        const cursoSel = document.getElementById('admin-curso-select');
        const materiaSel = document.getElementById('admin-materia-select');
        const userSel = document.getElementById('admin-user-select');

        // Llenar primer filtro: Cursos
        Object.keys(adminData).forEach(curso => {
            cursoSel.add(new Option(curso, curso));
        });

        // Evento: Al cambiar Curso
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

        // Evento: Al cambiar Materia
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

        // Evento: Al cambiar Usuario (AUTO-BÚSQUEDA)
        userSel.addEventListener('change', function() {
            const folio = this.value;
            if (!folio) return; // Si selecciona la opción por defecto vacía, no hace nada

            const curso = cursoSel.value;
            materiaActual = materiaSel.value; 

            // Actualizar Título de la página
            const titleEl = document.getElementById('materia-title');
            if (titleEl) titleEl.textContent = materiaActual;
            
            // Reiniciar estado de filtros visuales
            currentFilter = 'all';
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
            document.querySelector('.filter-btn.total').classList.add('active-filter');

            // Cargar los resultados automáticamente
            loadResults(folio, curso, materiaActual);
        });
    }

    // ==========================================
    // 2. DISPARADOR INICIAL
    // ==========================================
    if (materiaActual) {
        // Si el usuario normal entra, o el admin recarga la página
        loadResults('', '', materiaActual);
    } else {
        // Si el admin entra desde el menú, la gráfica arranca vacía
        document.getElementById('questions-nav').innerHTML = '<div style="padding: 15px; color: #7f8c8d; font-weight: 500;">Utiliza los filtros superiores para seleccionar un examen.</div>';
    }

    // ==========================================
    // 3. CARGA DE DATOS Y RENDERIZADO
    // ==========================================
    function loadResults(folio = '', curso = '', reqMateria = '') {
        const matToFetch = reqMateria || materiaActual;
        if (!matToFetch) return; 

        document.getElementById('questions-nav').innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Cargando examen...</div>';
        document.getElementById('single-question-container').innerHTML = '';

        let url = `/api/get-exam-results?materia=${encodeURIComponent(matToFetch)}`;
        if (folio) {
            url += `&folio=${encodeURIComponent(folio)}&curso=${encodeURIComponent(curso)}`;
        }

        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error("No se encontraron resultados para este alumno en esta materia.");
                return res.json();
            })
            .then(data => {
                if (!data.success) throw new Error(data.message);
                
                globalQuestions = data.details.map((q, idx) => ({ ...q, originalIndex: idx }));
                
                renderSummary(data.summary);
                renderChart(data.summary);
                setupFilters();
                renderNavigation(); 
            })
            .catch(err => {
                console.error(err);
                document.getElementById('questions-nav').innerHTML = '';
                document.getElementById('single-question-container').innerHTML = `<div style="text-align:center; color:#e74c3c; padding:30px; font-weight: bold; font-size: 16px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; display: block; margin-bottom: 10px;"></i> ${err.message}
                </div>`;
                
                renderSummary({calificacion: 0, total: 0, correctas: 0, incorrectas: 0, sin_responder: 0});
                if (currentChart) currentChart.destroy();
            });
    }

    function renderSummary(summary) {
        document.getElementById('score-number').textContent = summary.calificacion;
        document.getElementById('count-total').textContent = summary.total;
        document.getElementById('count-correct').textContent = summary.correctas;
        document.getElementById('count-incorrect').textContent = summary.incorrectas;
        document.getElementById('count-unanswered').textContent = summary.sin_responder;
    }

    function renderChart(summary) {
        if (currentChart) currentChart.destroy();

        currentChart = new Chart(chartCtx, {
            type: 'doughnut',
            data: {
                labels: ['Correctas', 'Incorrectas', 'Sin Responder'],
                datasets: [{
                    data: [summary.correctas, summary.incorrectas, summary.sin_responder],
                    backgroundColor: ['#27ae60', '#e74c3c', '#95a5a6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                cutout: '65%' 
            }
        });
    }

    function setupFilters() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', function() {
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
            navContainer.innerHTML = '<div style="color:#7f8c8d; padding:15px; width: 100%; text-align: center; font-weight: 600;">No hay preguntas en esta categoría.</div>';
            document.getElementById('single-question-container').innerHTML = '';
            return;
        }

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

        // Autoseleccionar la primera pregunta visible
        showQuestion(filteredQuestions[0].originalIndex);
    }

    // ==========================================
    // 4. RENDERIZADO Y FORMATO DE LA PREGUNTA
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

        // CONSTRUCCIÓN DEL CAJÓN DE LA PREGUNTA (Idéntico a examen.html)
        let html = `
            <div class="question-text" style="background-color: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
                <div class="q-header">
                    <span>PREGUNTA ${item.numero}</span>
                    <span>${statusText}</span>
                </div>
                
                <p style="margin-bottom: 15px;">
                    <strong>${item.numero}.</strong> <span class="format-text">${item.pregunta}</span>
                </p>
        `;

        // Párrafo de apoyo (si existe en el JSON de respuesta)
        if (item.Parrfafo && String(item.Parrfafo).trim() !== '' && String(item.Parrfafo).toLowerCase() !== 'nan') {
            html += `
                <p style="text-align: justify; margin-bottom: 15px; font-weight: normal; font-size: 0.95em; color: #444;">
                    <span class="format-text">${item.Parrfafo}</span>
                </p>
            `;
        }

        // Imagen de apoyo (si existe en el JSON de respuesta)
        if (item.Img_Parrafo && String(item.Img_Parrafo).trim() !== '' && String(item.Img_Parrafo).toLowerCase() !== 'nan') {
            html += `
                <div style="text-align: center; margin-bottom: 15px;">
                    <img src="/static/img/preguntas/${String(item.Img_Parrafo).trim()}" alt="Imagen de apoyo" style="max-width: 100%; height: auto; border: 1px solid #ddd; padding: 5px; border-radius: 4px; display: inline-block; background-color: white;">
                </div>
            `;
        }

        // Pregunta de párrafo (si existe en el JSON de respuesta)
        if (item.Pregunta_Parrafo && String(item.Pregunta_Parrafo).trim() !== '' && String(item.Pregunta_Parrafo).toLowerCase() !== 'nan') {
            html += `
                <p style="margin-bottom: 0; font-weight: normal; color: #2c3e50;">
                    <span class="format-text">${item.Pregunta_Parrafo}</span>
                </p>
            `;
        }

        html += `</div>`; // Cierra el cajón

        // CONSTRUCCIÓN DE LAS OPCIONES DE RESPUESTA
        html += `<div class="options-grid">`;

        ['A', 'B', 'C', 'D'].forEach(optKey => {
            const optText = item.opciones[optKey];
            if (!optText) return; 

            // Buscar la imagen correspondiente en el JSON (ej. item.Img_Respuesta_a)
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

            // Si hay imagen en la respuesta, colocarla debajo
            if (optImg && String(optImg).trim() !== '' && String(optImg).toLowerCase() !== 'nan') {
                html += `
                        <div style="margin-top: 10px; text-align: left;">
                            <img src="/static/img/preguntas/${String(optImg).trim()}" alt="Opción ${optKey}" style="max-width: 100%; max-height: 150px; height: auto; border-radius: 4px; border: 1px solid #ddd; padding: 3px;">
                        </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += `</div>`; 
        container.innerHTML = html;

        // INYECTAR EL FORMATEO DE ETIQUETAS A ESTA PREGUNTA
        formatExamText(container);
    }

    // ==========================================
    // 5. FUNCIÓN DE REEMPLAZO DE ETIQUETAS
    // ==========================================
    function formatExamText(containerElement) {
        const textElements = containerElement.querySelectorAll('.format-text');
        
        textElements.forEach(el => {
            let text = el.innerHTML;
            
            // Reemplazar saltos de línea /n
            text = text.replace(/\/n/g, '<br>');
            
            // Reemplazar negritas /b...b/
            text = text.replace(/\/b([\s\S]*?)b\//g, '<strong>$1</strong>');
            
            // Reemplazar itálicas /i...i/
            text = text.replace(/\/i([\s\S]*?)i\//g, '<em>$1</em>');
            
            // Reemplazar subrayado /u...u/
            text = text.replace(/\/u([\s\S]*?)u\//g, '<u>$1</u>');
            
            // Reemplazar marcatextos /m...m/ 
            text = text.replace(/\/m([\s\S]*?)m\//g, '<mark style="background-color: #f1c40f; color: #333; padding: 0 3px; border-radius: 2px;">$1</mark>');

            // Reemplazar texto centrado /c...c/
            text = text.replace(/\/c([\s\S]*?)c\//g, '<div style="text-align: center;">$1</div>');

            // NUEVO: Reemplazar fórmulas matemáticas /f...f/
            text = text.replace(/\/f([\s\S]*?)f\//g, '\\($1\\)');

            el.innerHTML = text;
        });

        // NUEVO: Pedirle a MathJax que renderice las matemáticas después de inyectar el HTML
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            // Le pasamos [containerElement] en lugar de buscar en todo el documento para que cargue rapidísimo
            window.MathJax.typesetPromise([containerElement]).catch((err) => console.log('Error en MathJax: ' + err.message));
        }
    }

});