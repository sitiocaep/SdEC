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

        let html = `
            <div class="q-header">
                <span>PREGUNTA ${item.numero}</span>
                <span>${statusText}</span>
            </div>
            <div class="q-text">${item.pregunta}</div>
            <div class="options-grid">
        `;

        ['A', 'B', 'C', 'D'].forEach(optKey => {
            const optText = item.opciones[optKey];
            if (!optText) return; 

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
                <div class="${rowClass}">
                    <div class="option-icon">${icon}</div>
                    <div>${optText}</div>
                </div>
            `;
        });

        html += `</div>`; 
        container.innerHTML = html;
    }
});