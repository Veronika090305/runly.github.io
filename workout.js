// workout.js - основной модуль тренировок
class WorkoutManager {
    constructor() {
        this.currentWorkout = null;
        this.workouts = [];
        this.templates = [];
        this.currentPlan = null;
        this.init();
    }

    async init() {
        await this.loadWorkouts();
        await this.loadTemplates();
        await this.loadCurrentPlan();
        this.setupEventListeners();
    }

    // Загрузка данных
    async loadWorkouts(period = 'month') {
        try {
            const { data, error } = await supabase
                .from('workouts')
                .select('*')
                .gte('workout_date', this.getPeriodStart(period))
                .lte('workout_date', this.getPeriodEnd(period))
                .order('workout_date', { ascending: false });

            if (error) throw error;
            this.workouts = data || [];
            this.renderWorkouts();
        } catch (error) {
            console.error('Ошибка загрузки тренировок:', error);
        }
    }

    async loadTemplates() {
        try {
            const { data, error } = await supabase
                .from('workout_templates')
                .select('*')
                .order('used_count', { ascending: false });

            if (error) throw error;
            this.templates = data || [];
            this.renderTemplates();
        } catch (error) {
            console.error('Ошибка загрузки шаблонов:', error);
        }
    }

    async loadCurrentPlan() {
        try {
            const { data, error } = await supabase
                .from('workout_plans')
                .select('*, plan_checks(*)')
                .eq('is_active', true)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            this.currentPlan = data;
            this.renderPlan();
        } catch (error) {
            console.error('Ошибка загрузки плана:', error);
        }
    }

    // Создание тренировки
    async createWorkout(workoutData) {
        try {
            const { data, error } = await supabase
                .from('workouts')
                .insert([workoutData])
                .select()
                .single();

            if (error) throw error;

            // Обновляем план, если тренировка в периоде плана
            if (this.currentPlan && this.isDateInPlanPeriod(workoutData.workout_date)) {
                await this.addPlanCheck(data.id, false);
            }

            // Добавляем в избранное если лайк
            if (workoutData.liked && workoutData.video_link) {
                await this.addToFavorites(data.id, 'like');
            }

            this.workouts.unshift(data);
            this.renderWorkouts();
            this.closeModal();
            
            return data;
        } catch (error) {
            console.error('Ошибка создания тренировки:', error);
            throw error;
        }
    }

    // Модальные окна
    openWorkoutModal(workout = null) {
        this.currentWorkout = workout;
        const modal = document.getElementById('workout-modal');
        const form = document.getElementById('workout-form');
        
        if (workout) {
            // Режим просмотра/редактирования
            this.populateWorkoutForm(workout);
            document.getElementById('workout-modal-title').textContent = workout.name;
        } else {
            // Режим создания
            form.reset();
            document.getElementById('workout-modal-title').textContent = 'Новая тренировка';
        }
        
        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('workout-modal').classList.remove('active');
        this.currentWorkout = null;
    }

    // Рендеринг
    renderWorkouts() {
        const container = document.getElementById('workouts-container');
        if (!container) return;

        if (this.workouts.length === 0) {
            container.innerHTML = `
                <div class="notice" style="text-align: center;">
                    <p>У вас пока нет тренировок</p>
                    <button class="button" onclick="workoutManager.openWorkoutModal()">
                        Добавить первую тренировку
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.workouts.map(workout => `
            <div class="workout-card" onclick="workoutManager.openWorkoutModal(${JSON.stringify(workout).replace(/"/g, '&quot;')})">
                <div class="workout-header">
                    <span class="workout-type ${workout.type}">${this.getTypeLabel(workout.type)}</span>
                    <span class="workout-mood">${workout.mood || '😐'}</span>
                </div>
                <h4>${workout.name}</h4>
                <div class="workout-date">
                    ${this.formatDate(workout.workout_date)} 
                    ${workout.start_time ? `в ${workout.start_time}` : ''}
                </div>
                ${workout.notes ? `<p class="small">${workout.notes.substring(0, 50)}...</p>` : ''}
            </div>
        `).join('');
    }

    renderPlan() {
        const container = document.getElementById('plan-container');
        if (!container || !this.currentPlan) return;

        const progress = Math.min(100, Math.round((this.currentPlan.achieved_count / this.currentPlan.target_count) * 100));
        
        container.innerHTML = `
            <div class="plan-card">
                <h3>План тренировок</h3>
                <p>Цель: ${this.currentPlan.target_count} тренировок за ${this.getPeriodLabel(this.currentPlan.period)}</p>
                
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                
                <div class="progress-info">
                    <strong>${this.currentPlan.achieved_count}</strong> из 
                    <strong>${this.currentPlan.target_count}</strong> выполнено
                    <span style="float: right;">${progress}%</span>
                </div>

                <div class="checks-grid">
                    ${this.renderPlanChecks()}
                </div>

                <button class="button" onclick="workoutManager.createNewPlan()" style="margin-top: 15px;">
                    ${this.currentPlan ? 'Изменить план' : 'Создать план'}
                </button>
            </div>
        `;
    }

    renderPlanChecks() {
        if (!this.currentPlan.plan_checks) return '';
        
        return this.currentPlan.plan_checks.map(check => `
            <div class="check-item ${check.workout_id ? '' : 'manual'} checked" 
                 onclick="${check.workout_id ? `workoutManager.openWorkoutModal(${JSON.stringify(this.workouts.find(w => w.id === check.workout_id))})` : ''}">
                ${check.workout_id ? '✓' : '+'}
            </div>
        `).join('');
    }

    // Вспомогательные методы
    getTypeLabel(type) {
        const labels = {
            'gym': 'Зал',
            'home': 'Дом',
            'video': 'Видео'
        };
        return labels[type] || type;
    }

    getPeriodLabel(period) {
        return period === 'week' ? 'неделю' : 'месяц';
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('ru-RU');
    }

    getPeriodStart(period) {
        const now = new Date();
        if (period === 'week') {
            return new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0];
        } else {
            return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        }
    }

    getPeriodEnd(period) {
        return new Date().toISOString().split('T')[0];
    }

    isDateInPlanPeriod(date) {
        if (!this.currentPlan) return false;
        const checkDate = new Date(date);
        return checkDate >= new Date(this.currentPlan.start_date) && 
               checkDate <= new Date(this.currentPlan.end_date);
    }

    setupEventListeners() {
        // Закрытие модального окна
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('workout-modal') || 
                e.target.classList.contains('close-modal')) {
                this.closeModal();
            }
        });

        // Обработка формы
        document.getElementById('workout-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleWorkoutSubmit();
        });

        // Выбор настроения
        document.querySelectorAll('.mood-option').forEach(option => {
            option.addEventListener('click', (e) => {
                document.querySelectorAll('.mood-option').forEach(m => m.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById('workout-mood').value = e.target.textContent;
            });
        });
    }

    async handleWorkoutSubmit() {
        const formData = new FormData(document.getElementById('workout-form'));
        
        const workoutData = {
            name: formData.get('name'),
            workout_date: formData.get('date'),
            start_time: formData.get('time') || null,
            type: formData.get('type'),
            video_link: formData.get('video_link') || null,
            mood: formData.get('mood'),
            notes: formData.get('notes') || null,
            liked: formData.get('liked') === 'true',
            exercises: JSON.parse(formData.get('exercises') || '[]'),
            is_from_template: formData.get('template_id') !== null
        };

        try {
            if (this.currentWorkout) {
                await this.updateWorkout(this.currentWorkout.id, workoutData);
            } else {
                await this.createWorkout(workoutData);
            }
        } catch (error) {
            alert('Ошибка сохранения тренировки: ' + error.message);
        }
    }
}

// Инициализация менеджера тренировок
let workoutManager;

document.addEventListener('DOMContentLoaded', () => {
    workoutManager = new WorkoutManager();
});
