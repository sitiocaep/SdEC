document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL ---
    const state = {
        quantity: 1, 
        cache: {},
        usedPlanteles: new Set(),
        activeRows: new Set()
    };

    // --- ELEMENTOS DOM ---
    const hiddenQty = document.getElementById('num_opciones_hidden');
    const addButtonCard = document.getElementById('add-option-card');
    const form = document.getElementById('school-form');
    
    // --- INICIALIZACIÓN ---
    function init() {
        let filled = 0;
        document.querySelectorAll('.school-select').forEach(s => { if(s.value) filled++; });
        state.quantity = Math.max(filled, 1);
        renderRows(state.quantity);
    }

    // --- RENDERIZADO ---
    function renderRows(count) {
        // Ocultar todas las filas
        for(let i=1; i<=10; i++) {
            const row = document.getElementById(`row-${i}`);
            if(row) {
                row.style.display = 'none';
                row.classList.remove('active');
                row.querySelectorAll('select').forEach(s => s.removeAttribute('required'));
            }
        }

        // Mostrar activas
        for(let i=1; i<=count; i++) {
            activateRow(i);
            updateRowCascade(i);
        }

        hiddenQty.value = count;
        
        updateUsedPlanteles();
        refreshAllPlantelOptions();
        
        // Verificar visibilidad del botón +
        updateAddButtonState();
    }

    function activateRow(rowNum) {
        const row = document.getElementById(`row-${rowNum}`);
        if(!row) return;
        
        row.style.display = 'flex';
        setTimeout(() => row.classList.add('active'), 10);
        
        const schoolSel = row.querySelector('.school-select');
        if(schoolSel) schoolSel.setAttribute('required', 'true');
        
        state.activeRows.add(rowNum);
    }

    // Mostrar (+) solo si la última fila está completa
    function updateAddButtonState() {
        if (!addButtonCard) return;

        if(state.quantity >= 10) {
            addButtonCard.style.display = 'none';
            return;
        }

        if(checkRowComplete(state.quantity)) {
            addButtonCard.style.display = 'flex';
        } else {
            addButtonCard.style.display = 'none';
        }
    }

    // --- MANEJADOR DEL BOTÓN "+" ---
    if(addButtonCard) {
        addButtonCard.addEventListener('click', () => {
            if(!checkRowComplete(state.quantity)) return;

            if(state.quantity < 10) {
                state.quantity++;
                renderRows(state.quantity);
                const newRow = document.getElementById(`row-${state.quantity}`);
                if(newRow) newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // --- CASCADA INTERNA ---
    function updateRowCascade(rowNum) {
        const row = document.getElementById(`row-${rowNum}`);
        if(!row) return;

        const schoolVal = row.querySelector('.school-select').value;
        const groupArea = document.getElementById(`group-area-${rowNum}`);
        const groupCarrera = document.getElementById(`group-carrera-${rowNum}`);
        const groupPlantel = document.getElementById(`group-plantel-${rowNum}`);

        if (IS_LICENCIATURA) {
            const areaSel = row.querySelector('.area-select');
            const carreraSel = row.querySelector('.carrera-select');
            const plantelSel = row.querySelector('.plantel-select');

            if (schoolVal) {
                if(groupArea) groupArea.style.display = 'flex';
                areaSel.setAttribute('required', 'true');
            } else {
                if(groupArea) groupArea.style.display = 'none';
                if(groupCarrera) groupCarrera.style.display = 'none';
                if(groupPlantel) groupPlantel.style.display = 'none';
                return;
            }

            if (areaSel.value) {
                if(groupCarrera) groupCarrera.style.display = 'flex';
                carreraSel.setAttribute('required', 'true');
            } else {
                if(groupCarrera) groupCarrera.style.display = 'none';
                if(groupPlantel) groupPlantel.style.display = 'none';
                return;
            }

            if (carreraSel.value) {
                if(groupPlantel) groupPlantel.style.display = 'flex';
                plantelSel.setAttribute('required', 'true');
            } else {
                if(groupPlantel) groupPlantel.style.display = 'none';
                return;
            }
        } else {
            // ECOEMS
            const plantelSel = row.querySelector('.plantel-select');
            if (schoolVal) {
                if(groupPlantel) groupPlantel.style.display = 'flex';
                plantelSel.setAttribute('required', 'true');
            } else {
                if(groupPlantel) groupPlantel.style.display = 'none';
            }
        }
    }

    function checkRowComplete(rowNum) {
        const row = document.getElementById(`row-${rowNum}`);
        if (!row) return false;
        
        const school = row.querySelector('.school-select');
        const plantel = row.querySelector('.plantel-select');
        
        if (!school.value || !plantel.value) return false;

        if (IS_LICENCIATURA) {
            const area = row.querySelector('.area-select');
            const carrera = row.querySelector('.carrera-select');
            return area && area.value && carrera && carrera.value;
        }
        return true;
    }

    // --- SCORE & COLORS ---
    function getNumericScore(rowNum) {
        const box = document.getElementById(`score-box-${rowNum}`);
        if (!box) return 0;
        const txt = box.textContent.trim();
        if (!txt || txt === '--' || txt === 'N/A') return 0;
        return parseInt(txt, 10) || 0;
    }

    function validateScoreColor(rowId) {
        const currentBox = document.getElementById(`score-box-${rowId}`);
        const currentScore = getNumericScore(rowId);
        
        currentBox.classList.remove('has-score', 'score-warning', 'score-danger');

        if (currentScore === 0) return;

        if (rowId == 1) {
            currentBox.classList.add('has-score');
            return;
        }

        const prevScore = getNumericScore(rowId - 1);
        if (prevScore === 0) {
            currentBox.classList.add('has-score');
            return;
        }

        if (currentScore > prevScore) {
            currentBox.classList.add('score-danger');
        } else if (currentScore === prevScore) {
            currentBox.classList.add('score-warning');
        } else {
            currentBox.classList.add('has-score');
        }
    }

    function hasScoreInconsistencies() {
        let hasInconsistency = false;
        for(let i = 2; i <= state.quantity; i++) {
            const curr = getNumericScore(i);
            const prev = getNumericScore(i-1);
            if(curr > 0 && prev > 0 && curr > prev) {
                hasInconsistency = true;
                break;
            }
        }
        return hasInconsistency;
    }

    // --- DUPLICADOS ---
    function updateUsedPlanteles() {
        state.usedPlanteles.clear();
        document.querySelectorAll('.plantel-select').forEach(select => {
            if (select.value) state.usedPlanteles.add(select.value);
        });
    }

    function refreshAllPlantelOptions() {
        document.querySelectorAll('.plantel-select').forEach(select => {
            const currentVal = select.value;
            for (let i = 0; i < select.options.length; i++) {
                const opt = select.options[i];
                if (!opt.value) continue;
                
                if (state.usedPlanteles.has(opt.value) && opt.value !== currentVal) {
                    opt.style.display = 'none';
                    opt.disabled = true;
                } else {
                    opt.style.display = '';
                    opt.disabled = false;
                }
            }
        });
    }

    // --- API ---
    async function getData(institucion) {
        if(!institucion) return [];
        if(state.cache[institucion]) return state.cache[institucion];
        try {
            const res = await fetch(`/api/planteles_por_escuela?institucion=${encodeURIComponent(institucion)}`);
            const json = await res.json();
            if(json.success) {
                state.cache[institucion] = json.planteles;
                return json.planteles;
            }
        } catch(e) { console.error(e); }
        return [];
    }

    function updateScore(rowId, txt) {
        const box = document.getElementById(`score-box-${rowId}`);
        if(box) {
            box.textContent = txt && txt !== 'N/A' ? txt : '--';
            validateScoreColor(rowId);
            const nextRow = parseInt(rowId) + 1;
            if (nextRow <= state.quantity) validateScoreColor(nextRow);
        }
    }

    // --- LISTENERS GENERALES ---
    document.querySelectorAll('.school-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const row = e.target.dataset.opcion;
            const inst = e.target.value;
            
            // Limpieza inicial
            if(IS_LICENCIATURA) {
                const areaSel = document.querySelector(`.area-select[data-opcion="${row}"]`);
                const carrSel = document.querySelector(`.carrera-select[data-opcion="${row}"]`);
                const planSel = document.querySelector(`.plantel-select[data-opcion="${row}"]`);
                areaSel.innerHTML = '<option value="">Selecciona el Área...</option>';
                carrSel.innerHTML = '<option value="">Selecciona la Carrera...</option>';
                planSel.innerHTML = '<option value="">Selecciona el Plantel...</option>';
            } else {
                const planSel = document.querySelector(`.plantel-select[data-opcion="${row}"]`);
                planSel.innerHTML = '<option value="">Selecciona el Plantel...</option>';
            }
            
            updateScore(row, null);
            updateUsedPlanteles();
            refreshAllPlantelOptions();
            
            if(inst) {
                const data = await getData(inst);
                if (IS_LICENCIATURA) {
                    const areaSel = document.querySelector(`.area-select[data-opcion="${row}"]`);
                    const areas = [...new Set(data.map(d => d.area).filter(Boolean))].sort();
                    areas.forEach(a => areaSel.add(new Option(a, a)));
                } else {
                    const planSel = document.querySelector(`.plantel-select[data-opcion="${row}"]`);
                    data.forEach(d => {
                        const opt = new Option(d.escuela, d.escuela);
                        opt.dataset.score = d.puntaje_str;
                        planSel.add(opt);
                    });
                    refreshAllPlantelOptions();
                }
            }
            updateRowCascade(row);
            updateAddButtonState();
        });
    });

    if (IS_LICENCIATURA) {
        document.querySelectorAll('.area-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const row = e.target.dataset.opcion;
                const area = e.target.value;
                const inst = document.querySelector(`.school-select[data-opcion="${row}"]`).value;
                const carrSel = document.querySelector(`.carrera-select[data-opcion="${row}"]`);
                const planSel = document.querySelector(`.plantel-select[data-opcion="${row}"]`);

                carrSel.innerHTML = '<option value="">Selecciona la Carrera...</option>';
                planSel.innerHTML = '<option value="">Selecciona el Plantel...</option>';
                updateScore(row, null);
                
                if(inst && area) {
                    const data = await getData(inst);
                    const filtered = data.filter(d => d.area === area);
                    const carreras = [...new Set(filtered.map(d => d.carrera).filter(Boolean))].sort();
                    carreras.forEach(c => carrSel.add(new Option(c, c)));
                }
                updateRowCascade(row);
                updateAddButtonState();
            });
        });

        document.querySelectorAll('.carrera-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const row = e.target.dataset.opcion;
                const carrera = e.target.value;
                const inst = document.querySelector(`.school-select[data-opcion="${row}"]`).value;
                const area = document.querySelector(`.area-select[data-opcion="${row}"]`).value;
                const planSel = document.querySelector(`.plantel-select[data-opcion="${row}"]`);

                planSel.innerHTML = '<option value="">Selecciona el Plantel...</option>';
                updateScore(row, null);
                
                if(inst && area && carrera) {
                    const data = await getData(inst);
                    const filtered = data.filter(d => d.area === area && d.carrera === carrera);
                    filtered.forEach(d => {
                        const opt = new Option(d.escuela, d.escuela);
                        opt.dataset.score = d.puntaje_str;
                        planSel.add(opt);
                    });
                    refreshAllPlantelOptions();
                }
                updateRowCascade(row);
                updateAddButtonState();
            });
        });
    }

    document.querySelectorAll('.plantel-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const row = e.target.dataset.opcion;
            const opt = e.target.options[e.target.selectedIndex];
            updateScore(row, opt.dataset.score);
            updateUsedPlanteles();
            refreshAllPlantelOptions();
            updateAddButtonState();
        });
    });

    // --- AUTO-HIDRATACIÓN ---
    setTimeout(() => {
        document.querySelectorAll('.school-select').forEach(async (sel) => {
            const row = sel.dataset.opcion;
            const inst = sel.value;
            if(!inst) return;

            const planSel = document.querySelector(`.plantel-select[data-opcion="${row}"]`);
            const targetPlan = planSel.dataset.preselected;

            if(IS_LICENCIATURA) {
                const areaSel = document.querySelector(`.area-select[data-opcion="${row}"]`);
                const carrSel = document.querySelector(`.carrera-select[data-opcion="${row}"]`);
                const targetArea = areaSel.dataset.preselected;
                const targetCarr = carrSel.dataset.preselected;

                const data = await getData(inst);
                
                const areas = [...new Set(data.map(d => d.area).filter(Boolean))].sort();
                areas.forEach(a => {
                    const opt = new Option(a, a);
                    if(a === targetArea) opt.selected = true;
                    areaSel.add(opt);
                });

                if(targetArea) {
                    const filteredA = data.filter(d => d.area === targetArea);
                    const carreras = [...new Set(filteredA.map(d => d.carrera).filter(Boolean))].sort();
                    carreras.forEach(c => {
                        const opt = new Option(c, c);
                        if(c === targetCarr) opt.selected = true;
                        carrSel.add(opt);
                    });

                    if(targetCarr) {
                        const filteredC = filteredA.filter(d => d.carrera === targetCarr);
                        filteredC.forEach(d => {
                            const opt = new Option(d.escuela, d.escuela);
                            opt.dataset.score = d.puntaje_str;
                            if(d.escuela === targetPlan) {
                                opt.selected = true;
                                updateScore(row, d.puntaje_str);
                            }
                            planSel.add(opt);
                        });
                    }
                }
            } else {
                const data = await getData(inst);
                data.forEach(d => {
                    const opt = new Option(d.escuela, d.escuela);
                    opt.dataset.score = d.puntaje_str;
                    if(d.escuela === targetPlan) {
                        opt.selected = true;
                        updateScore(row, d.puntaje_str);
                    }
                    planSel.add(opt);
                });
            }

            updateRowCascade(row);
            updateUsedPlanteles();
            refreshAllPlantelOptions();
            validateScoreColor(row);
            updateAddButtonState(); 
        });
    }, 200);

    // --- LÓGICA DE LLENADO INTELIGENTE (FRONTEND) ---
    async function executeSmartFill() {
        const aiModal = document.getElementById('confirm-ai-modal');
        if(aiModal) aiModal.style.display = 'none';

        // 1. Recopilar datos actuales
        let options = [];
        for (let i = 1; i <= state.quantity; i++) {
            const row = document.getElementById(`row-${i}`);
            if (!row || !checkRowComplete(i)) continue; // Solo ordenar filas completas

            const school = row.querySelector('.school-select').value;
            const plantel = row.querySelector('.plantel-select').value;
            const score = getNumericScore(i);

            let item = { school, plantel, score };

            if (IS_LICENCIATURA) {
                item.area = row.querySelector('.area-select').value;
                item.carrera = row.querySelector('.carrera-select').value;
            }
            options.push(item);
        }

        // 2. Ordenar por puntaje descendente (Mayor a Menor)
        options.sort((a, b) => b.score - a.score);

        // 3. Limpiar UI actual (Resetear todo)
        // Opcional: Reiniciar cantidad a la cantidad de filas válidas encontradas
        state.quantity = options.length > 0 ? options.length : 1;
        state.usedPlanteles.clear();

        // Limpiar selects visualmente
        for (let i = 1; i <= 10; i++) {
            const row = document.getElementById(`row-${i}`);
            if(row) {
                row.querySelector('.school-select').value = "";
                // Disparar evento para limpiar hijos
                row.querySelector('.school-select').dispatchEvent(new Event('change'));
            }
        }

        // 4. Volver a llenar en orden
        // Necesitamos esperar a que se carguen los datos en cada paso
        for (let i = 0; i < options.length; i++) {
            const rowNum = i + 1;
            const opt = options[i];
            const row = document.getElementById(`row-${rowNum}`);

            // A. Set Escuela
            const schoolSel = row.querySelector('.school-select');
            schoolSel.value = opt.school;
            
            // Fetch manual para asegurar sincronía
            const data = await getData(opt.school);

            if (IS_LICENCIATURA) {
                // B. Llenar Area
                const areaSel = row.querySelector('.area-select');
                const areas = [...new Set(data.map(d => d.area).filter(Boolean))].sort();
                areaSel.innerHTML = '<option value="">Selecciona el Área...</option>';
                areas.forEach(a => areaSel.add(new Option(a, a)));
                areaSel.value = opt.area;

                // C. Llenar Carrera
                const carrSel = row.querySelector('.carrera-select');
                const filteredA = data.filter(d => d.area === opt.area);
                const carreras = [...new Set(filteredA.map(d => d.carrera).filter(Boolean))].sort();
                carrSel.innerHTML = '<option value="">Selecciona la Carrera...</option>';
                carreras.forEach(c => carrSel.add(new Option(c, c)));
                carrSel.value = opt.carrera;

                // D. Llenar Plantel
                const planSel = row.querySelector('.plantel-select');
                const filteredC = filteredA.filter(d => d.carrera === opt.carrera);
                planSel.innerHTML = '<option value="">Selecciona el Plantel...</option>';
                filteredC.forEach(d => {
                    const option = new Option(d.escuela, d.escuela);
                    option.dataset.score = d.puntaje_str;
                    planSel.add(option);
                });
                planSel.value = opt.plantel;
                
            } else {
                // ECOEMS
                const planSel = row.querySelector('.plantel-select');
                planSel.innerHTML = '<option value="">Selecciona el Plantel...</option>';
                data.forEach(d => {
                    const option = new Option(d.escuela, d.escuela);
                    option.dataset.score = d.puntaje_str;
                    planSel.add(option);
                });
                planSel.value = opt.plantel;
            }

            // Actualizar UI Score y Cascada
            updateScore(rowNum, opt.score.toString());
            updateRowCascade(rowNum);
            
            // Actualizar set de usados para la siguiente iteración
            state.usedPlanteles.add(opt.plantel);
        }

        // Render final
        renderRows(state.quantity);
    }

    // --- MODALES & HELPERS ---
    const saveModal = document.getElementById('save-confirm-modal');
    const preSaveBtn = document.getElementById('pre-save-btn');
    const finalSaveBtn = document.getElementById('final-save-btn');
    const modalSmartFillBtn = document.getElementById('modal-smart-fill-btn');
    const smartFillWarning = document.getElementById('smart-fill-warning');
    const modalCloses = document.querySelectorAll('.close-save-modal');

    if(preSaveBtn && saveModal) {
        preSaveBtn.addEventListener('click', () => {
            if(!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            const hasIssues = hasScoreInconsistencies();
            if(hasIssues) {
                if(modalSmartFillBtn) modalSmartFillBtn.style.display = 'block';
                if(smartFillWarning) smartFillWarning.style.display = 'block';
            } else {
                if(modalSmartFillBtn) modalSmartFillBtn.style.display = 'none';
                if(smartFillWarning) smartFillWarning.style.display = 'none';
            }
            saveModal.style.display = 'flex';
        });

        modalCloses.forEach(btn => btn.addEventListener('click', () => saveModal.style.display = 'none'));
        finalSaveBtn.addEventListener('click', () => form.submit());
        
        if(modalSmartFillBtn) {
            modalSmartFillBtn.addEventListener('click', () => {
                saveModal.style.display = 'none';
                const aiModal = document.getElementById('confirm-ai-modal');
                if(aiModal) aiModal.style.display = 'flex';
            });
        }

        // NUEVO: Cerrar modal de guardado al hacer clic fuera
        saveModal.addEventListener('click', (e) => {
            if (e.target === saveModal) {
                saveModal.style.display = 'none';
            }
        });
    }

    // Listener para el botón confirmar del modal de AI
    const aiModal = document.getElementById('confirm-ai-modal');
    if(aiModal) {
        aiModal.querySelectorAll('.confirm-modal-close').forEach(c => c.addEventListener('click', () => aiModal.style.display = 'none'));
        const confirmAiAction = document.getElementById('confirm-ai-action');
        if(confirmAiAction) {
            confirmAiAction.addEventListener('click', executeSmartFill);
        }

        // NUEVO: Cerrar modal de AI al hacer clic fuera
        aiModal.addEventListener('click', (e) => {
            if (e.target === aiModal) {
                aiModal.style.display = 'none';
            }
        });
    }

    const helpBtn = document.getElementById('help-btn-escuelas');
    const helpModal = document.getElementById('help-modal-escuelas');
    if(helpBtn && helpModal) {
        helpBtn.addEventListener('click', () => helpModal.style.display = 'flex');
        helpModal.querySelectorAll('.modal-close').forEach(c => c.addEventListener('click', () => helpModal.style.display = 'none'));
        
        // NUEVO: Cerrar modal de ayuda al hacer clic fuera
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.style.display = 'none';
            }
        });
    }

    // Función global para descarga
    window.downloadSeleccionPDF = function(b64Data, filename) {
        try {
            const byteCharacters = atob(b64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], {type: 'application/pdf'});
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            // Opcional: Cambiar texto del botón para feedback visual
            const btn = document.querySelector('#download-modal-escuelas .btn-success');
            if(btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> Descargado';
                btn.disabled = true;
            }
        } catch (e) {
            console.error("Error al descargar PDF:", e);
            alert("Hubo un error al intentar descargar el documento.");
        }
    };

    init();
});