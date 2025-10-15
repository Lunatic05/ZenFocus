// Global variables
let currentDate = new Date();
let projects = [];
let tasks = [];
let notes = [];
let selectedDate = new Date();
let draggedTask = null;
let originalStartDate = null;
let originalEndDate = null;
let editingTaskId = null;
let notesCollection = null;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set up event listeners
    document.getElementById('todoForm').addEventListener('submit', handleAddTask);
    document.getElementById('editTaskForm').addEventListener('submit', handleEditTask);
    document.getElementById('taskEditModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('taskEditModal')) {
            closeEditModal();
        }
    });
    
    // Note editor event listener
    document.getElementById('noteForm').addEventListener('submit', saveNote);

    // Set default dates
    const today = new Date();
    document.getElementById('startDate').valueAsDate = today;
    document.getElementById('endDate').valueAsDate = today;
    document.getElementById('editStartDate').valueAsDate = today;
    document.getElementById('editEndDate').valueAsDate = today;

    // Set up Firebase listeners
    setupFirebaseListeners();

    // Initialize UI
    showModule('dashboard');
    renderDashboard();
    updateProjectSelects();
});

// Firebase setup
function setupFirebaseListeners() {
    // Initialize notesCollection
    notesCollection = db.collection('notes');
    
    // Projects listener
    db.collection('projects').onSnapshot(snapshot => {
        projects = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                created: data.created?.toDate?.() || new Date(data.created)
            };
        });
        renderProjects();
        updateProjectSelects();
    });

    // Tasks listener
    db.collection('tasks').onSnapshot(snapshot => {
        tasks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                priority: String(data.priority || 'Medium'),
                start: data.start?.toDate?.() || new Date(data.start),
                end: data.end?.toDate?.() || new Date(data.end)
            };
        });
        renderTodoList();
        renderDashboard();
        renderProjects();
        if (document.getElementById('calendar').style.display === 'block') {
            renderMainCalendar();
        }
    });
    
    // Notes listener
    notesCollection.onSnapshot(snapshot => {
        notes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        if(document.getElementById('notes').style.display === 'block') renderNotes();
    });
}

// Module navigation
function showModule(moduleId) {
    document.querySelectorAll('.module').forEach(module => {
        module.style.display = 'none';
    });
    document.getElementById(moduleId).style.display = 'block';
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
    
    if(moduleId === 'dashboard') renderDashboard();
    if(moduleId === 'calendar') renderMainCalendar();
    if(moduleId === 'todo') renderTodoList();
    if(moduleId === 'projects') renderProjects();
    if(moduleId === 'notes') renderNotes();
}

// Project functions
function showCreateProjectForm() {
    document.getElementById('createProjectForm').style.display = 'block';
}

function cancelProjectCreate() {
    document.getElementById('createProjectForm').style.display = 'none';
    document.getElementById('projectName').value = '';
}

async function createProject() {
    const projectName = document.getElementById('projectName').value.trim();
    if (!projectName) return;

    const project = {
        name: projectName,
        created: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('projects').add(project);
        cancelProjectCreate();
    } catch (error) {
        showError('Error creating project: ' + error.message);
    }
}

function renderProjects() {
    const projectsList = document.getElementById('projectsList');
    projectsList.innerHTML = projects.map(project => `
        <div class="project-card ${getProjectStatusClass(project)}" onclick="viewProject('${project.id}')">
            <div class="project-meta">
                <h3>${project.name}</h3>
                <span class="project-status">${project.status || 'Active'}</span>
            </div>
            
            <div class="project-stats">
                <div class="stat-item">
                    <div class="stat-value">${tasks.filter(t => t.projectId === project.id).length}</div>
                    <div class="stat-label">Tasks</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${calculateProjectProgress(project.id)}%</div>
                    <div class="stat-label">Progress</div>
                </div>
            </div>
            
            <div class="project-timeline">
                <div class="timeline-bar">
                    <div class="timeline-progress" style="width: ${calculateProjectProgress(project.id)}%"></div>
                </div>
            </div>
            
            <div class="project-tags">
                <span class="project-tag">${project.category || 'General'}</span>
                <span class="project-tag">${formatDate(project.created)}</span>
            </div>
            
            <div class="project-actions">
                <button class="delete-project-btn" onclick="event.stopPropagation(); deleteProject('${project.id}')">×</button>
            </div>
        </div>
    `).join('');
}

function getProjectStatusClass(project) {
    if (project.completed) return 'completed';
    if (project.dueDate && new Date(project.dueDate) < new Date()) return 'urgent';
    return 'ongoing';
}

async function deleteProject(projectId) {
    if (!confirm('Delete this project and all its tasks?')) return;
    
    try {
        // Delete project
        await db.collection('projects').doc(projectId).delete();
        
        // Delete associated tasks
        const tasksSnapshot = await db.collection('tasks')
            .where('projectId', '==', projectId)
            .get();
        
        const batch = db.batch();
        tasksSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
    } catch (error) {
        showError('Error deleting project: ' + error.message);
    }
}

function viewProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const projectTasks = tasks.filter(t => t.projectId === projectId);
    const modal = document.getElementById('projectModal');
    
    document.getElementById('projectModalTitle').textContent = `${project.name} Tasks`;
    document.getElementById('projectTaskList').innerHTML = projectTasks.map(task => `
        <div class="task-item">
            <div>
                <h4 style="${task.completed ? 'text-decoration: line-through' : ''}">
                    ${task.text}
                </h4>
                <small>${formatDate(task.start)} - ${formatDate(task.end)}</small>
                <div class="task-meta">
                    <span class="status-badge ${(task.status || 'not-started').replace(' ', '-')}">
                        ${task.status}
                    </span>
                    <span class="priority-badge ${task.priority?.toLowerCase() || 'medium'}">
                        ${task.priority}
                    </span>
                </div>
            </div>
            <div>
                <button onclick="toggleTask('${task.id}', true)">${task.completed ? '✓' : '◻'}</button>
                <button onclick="deleteTask('${task.id}')">×</button>
            </div>
        </div>
    `).join('') || '<p>No tasks in this project</p>';
    
    modal.style.display = 'block';
}

function closeProjectModal() {
    document.getElementById('projectModal').style.display = 'none';
}

function updateProjectSelects() {
    const selects = [
        document.getElementById('projectSelect'),
        document.getElementById('editProjectSelect')
    ];
    
    selects.forEach(select => {
        if (select) {
            select.innerHTML = `
                <option value="">Select Project</option>
                ${projects.map(p => `
                    <option value="${p.id}">${p.name}</option>
                `).join('')}
            `;
        }
    });
}

// Task functions
async function handleAddTask(e) {
    e.preventDefault();

    const taskInput = document.getElementById('taskInput').value.trim();
    const startDate = new Date(document.getElementById('startDate').value);
    const endDate = new Date(document.getElementById('endDate').value);
    endDate.setHours(23, 59, 59, 999);
    const projectId = document.getElementById('projectSelect').value;
    const status = document.getElementById('statusSelect').value;
    const priority = document.getElementById('prioritySelect').value;

    if (!taskInput || !projectId) {
        showError('Please fill all required fields');
        return;
    }

    const task = {
        text: taskInput,
        start: firebase.firestore.Timestamp.fromDate(startDate),
        end: firebase.firestore.Timestamp.fromDate(endDate),
        projectId: projectId,
        completed: status === 'Completed',
        priority: priority || 'Medium',
        status: status || 'Not Started'
    };

    try {
        await db.collection('tasks').add(task);
        e.target.reset();
    } catch (error) {
        showError('Error adding task: ' + error.message);
    }
}

function renderTodoList() {
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = tasks.map(task => {
        const isForSelectedDate = selectedDate >= new Date(task.start) && 
                                 selectedDate <= new Date(task.end);
        const isCompleted = (task.completedDates || []).includes(getLocalDateString(selectedDate));
        
        return `
            <div class="task-item">
                <div>
                    <h4 style="${isCompleted ? 'text-decoration: line-through' : ''}">
                        ${task.text}
                        <small>(${projects.find(p => p.id === task.projectId)?.name || 'No Project'})</small>
                    </h4>
                    <small>${formatDate(task.start)} - ${formatDate(task.end)}</small>
                    <div class="task-meta">
                        ${isForSelectedDate ? `
                            <span class="status-badge ${isCompleted ? 'completed' : 'not-started'}">
                                ${isCompleted ? 'Completed' : 'Pending'}
                            </span>
                        ` : ''}
                        <span class="priority-badge ${String(task.priority || 'Medium').toLowerCase()}">
                            ${task.priority}
                        </span>
                    </div>
                </div>
                <div>
                    ${isForSelectedDate ? `
                        <button onclick="toggleTask('${task.id}')">
                            ${isCompleted ? '✓' : '◻'}
                        </button>
                    ` : ''}
                    <button onclick="openEditModal('${task.id}')">✎</button>
                    <button onclick="deleteTask('${task.id}')">×</button>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleTask(taskId) {
    try {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const dateString = getLocalDateString(selectedDate);
        const updatedDates = task.completedDates || [];
        const isCompleted = updatedDates.includes(dateString);

        const newDates = isCompleted 
            ? updatedDates.filter(d => d !== dateString)
            : [...updatedDates, dateString];

        await db.collection('tasks').doc(taskId).update({
            completedDates: newDates
        });

        // Refresh views
        if (document.getElementById('calendar').style.display === 'block') {
            renderMainCalendar();
        }
        if (document.getElementById('dashboard').style.display === 'block') {
            renderCompactCalendar();
            renderDashboard();
        }
    } catch (error) {
        showError('Error updating task: ' + error.message);
    }
}

function openEditModal(taskId) {
    editingTaskId = taskId;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Populate project dropdown
    const editProjectSelect = document.getElementById('editProjectSelect');
    editProjectSelect.innerHTML = `
        <option value="">Select Project</option>
        ${projects.map(p => `
            <option value="${p.id}" ${p.id === task.projectId ? 'selected' : ''}>${p.name}</option>
        `).join('')}
    `;

    // Populate form fields with task data
    document.getElementById('editTaskInput').value = task.text;
    document.getElementById('editStartDate').value = task.start.toISOString().split('T')[0];
    document.getElementById('editEndDate').value = task.end.toISOString().split('T')[0];
    document.getElementById('editStatusSelect').value = task.status || 'Not Started';
    document.getElementById('editPrioritySelect').value = task.priority || 'Medium';

    // Display the modal
    document.getElementById('taskEditModal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('taskEditModal').style.display = 'none';
    editingTaskId = null;
}

async function handleEditTask(e) {
    e.preventDefault();

    if (!editingTaskId) return;

    const taskInput = document.getElementById('editTaskInput').value.trim();
    const startDate = new Date(document.getElementById('editStartDate').value);
    const endDate = new Date(document.getElementById('editEndDate').value);
    endDate.setHours(23, 59, 59, 999);
    const projectId = document.getElementById('editProjectSelect').value;
    const status = document.getElementById('editStatusSelect').value;
    const priority = document.getElementById('editPrioritySelect').value;

    if (!taskInput || !projectId) {
        showError('Please fill all required fields');
        return;
    }

    try {
        await db.collection('tasks').doc(editingTaskId).update({
            text: taskInput,
            start: firebase.firestore.Timestamp.fromDate(startDate),
            end: firebase.firestore.Timestamp.fromDate(endDate),
            projectId: projectId,
            status: status,
            priority: priority,
            completed: status === 'Completed'
        });
        closeEditModal();
    } catch (error) {
        showError('Error updating task: ' + error.message);
    }
}

async function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
        await db.collection('tasks').doc(id).delete();
    } catch (error) {
        showError('Error deleting task: ' + error.message);
    }
}

// Calendar functions
function renderMainCalendar() {
    const calendar = document.getElementById('mainCalendar');
    calendar.classList.add('main-calendar');
    const monthLabel = document.getElementById('currentMonth');
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    monthLabel.textContent = `${firstDay.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`;
    calendar.innerHTML = '';

    for (let i = 0; i < firstDay.getDay(); i++) {
        calendar.appendChild(createDayElement(''));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dayElement = createDayElement(day, date);
        if (hasTasksOnDate(date)) {
            dayElement.classList.add('has-tasks');
        }
        calendar.appendChild(dayElement);
    }
}

function renderCompactCalendar() {
    const calendar = document.getElementById('compactCalendar');
    calendar.classList.remove('main-calendar');

    const monthLabel = document.getElementById('compactMonth');
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    monthLabel.textContent = `${firstDay.toLocaleString('default', { month: 'long' })} ${currentDate.getFullYear()}`;
    calendar.innerHTML = '';

    for (let i = 0; i < firstDay.getDay(); i++) {
        calendar.appendChild(createDayElement(''));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dayElement = createDayElement(day, date, true);
        if (hasTasksOnDate(date)) {
            dayElement.classList.add('has-tasks');
        }
        if (date.toDateString() === selectedDate.toDateString()) {
            dayElement.classList.add('selected-date');
        }
        calendar.appendChild(dayElement);
    }
}

function createDayElement(day, date, isCompact = false) {
    const dayElement = document.createElement('div');
    dayElement.className = `calendar-day ${isCompact ? 'compact-day' : ''}`;

    // Date number
    const dateNumber = document.createElement('div');
    dateNumber.className = 'date-number';
    dateNumber.textContent = day;
    dayElement.appendChild(dateNumber);

    // Add today's date highlighting
    if (date && date.toDateString() === new Date().toDateString()) {
        dayElement.classList.add('today');
    }

    // Add weekend styling
    if (date && [0, 6].includes(date.getDay())) {
        dayElement.classList.add('weekend');
    }

    if (date && !isCompact) {
        const tasksForDate = getTasksForDate(date);
        
        // Event dots container
        const eventDots = document.createElement('div');
        eventDots.className = 'event-dots';
        
        // Task list container
        const taskList = document.createElement('div');
        taskList.className = 'calendar-task-list';

        tasksForDate.forEach(task => {
            const isCompleted = (task.completedDates || [])
                .includes(date.toISOString().split('T')[0]);

            // Add event dots
            const dot = document.createElement('div');
            dot.className = `event-dot ${task.priority.toLowerCase()}-priority`;
            eventDots.appendChild(dot);

            // Task element
            const taskElement = document.createElement('div');
            taskElement.className = `calendar-task ${isCompleted ? 'completed' : ''}`;
            taskElement.draggable = true;
            taskElement.innerHTML = `
                <div class="calendar-task-content">
                    ${task.text}
                    <button class="delete-task-btn" onclick="deleteTask('${task.id}')">×</button>
                </div>
            `;
            
            const deleteBtn = taskElement.querySelector('.delete-task-btn');
            deleteBtn.style.marginLeft = '5px';
            deleteBtn.style.padding = '0 4px';
            deleteBtn.style.borderRadius = '50%';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteTask(task.id);
            };
            
            taskElement.style.borderLeft = `3px solid ${getPriorityColor(task.priority)}`;
            
            // Drag event handlers
            taskElement.addEventListener('dragstart', () => handleDragStart(task, date));
            taskElement.addEventListener('dragend', handleDragEnd);

            taskList.appendChild(taskElement);
        });

        dayElement.appendChild(taskList);
        dayElement.appendChild(eventDots);

        // Drop event handlers
        dayElement.addEventListener('dragover', handleDragOver);
        dayElement.addEventListener('drop', (e) => handleDrop(e, date));
    }

    if (date) {
        dayElement.addEventListener('click', () => {
            selectedDate = new Date(date);
            selectedDate.setHours(12, 0, 0, 0);
            
            if(isCompact) {
                renderCompactCalendar();
                renderDashboard();
            }
            updateTaskList();
        });

        if (hasTasksOnDate(date)) {
            dayElement.classList.add('has-tasks');
        }
    }
    return dayElement;
}

function getTasksForDate(date) {
    const dateString = getLocalDateString(date);
    return tasks.filter(task => {
        const taskStart = new Date(task.start);
        const taskEnd = new Date(task.end);
        
        // Convert all dates to local midnight for accurate comparison
        const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const localStart = new Date(taskStart.getFullYear(), taskStart.getMonth(), taskStart.getDate());
        const localEnd = new Date(taskEnd.getFullYear(), taskEnd.getMonth(), taskEnd.getDate());

        return localDate >= localStart && 
               localDate <= localEnd &&
               !(task.completedDates || []).includes(dateString);
    });
}

function hasTasksOnDate(date) {
    const dateString = getLocalDateString(date);
    return tasks.some(task => {
        const taskStart = new Date(task.start);
        const taskEnd = new Date(task.end);
        const localStart = new Date(taskStart.getFullYear(), taskStart.getMonth(), taskStart.getDate());
        const localEnd = new Date(taskEnd.getFullYear(), taskEnd.getMonth(), taskEnd.getDate());
        const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        return localDate >= localStart && 
               localDate <= localEnd &&
               !(task.completedDates || []).includes(dateString);
    });
}

// Drag and drop functions
function handleDragStart(task, date) {
    draggedTask = task;
    const taskStart = task.start instanceof Date ? task.start : new Date(task.start);
    const taskEnd = task.end instanceof Date ? task.end : new Date(task.end);
    
    // Calculate which part of the task is being dragged
    const dayOffset = Math.floor((date - taskStart) / (1000 * 3600 * 24));
    const totalDays = Math.ceil((taskEnd - taskStart) / (1000 * 3600 * 24));
    
    draggedTask.dragType = 'middle';
    if (dayOffset === 0) draggedTask.dragType = 'start';
    if (dayOffset === totalDays - 1) draggedTask.dragType = 'end';

    originalStartDate = taskStart;
    originalEndDate = taskEnd;
    
    event.target.classList.add('dragging');
    event.dataTransfer.setData('text/plain', '');
}

function handleDragEnd() {
    event.target.classList.remove('dragging');
    draggedTask = null;
    originalStartDate = null;
    originalEndDate = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drop-target');
}

async function handleDrop(e, dropDate) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target');

    if (!draggedTask) return;

    try {
        const newDate = new Date(dropDate);
        let updates = {};
        
        switch(draggedTask.dragType) {
            case 'start':
                updates.start = firebase.firestore.Timestamp.fromDate(newDate);
                updates.end = firebase.firestore.Timestamp.fromDate(originalEndDate);
                break;
                
            case 'end':
                updates.start = firebase.firestore.Timestamp.fromDate(originalStartDate);
                updates.end = firebase.firestore.Timestamp.fromDate(newDate);
                break;
                
            default: // middle
                const diff = newDate - originalStartDate;
                updates.start = firebase.firestore.Timestamp.fromDate(new Date(originalStartDate.getTime() + diff));
                updates.end = firebase.firestore.Timestamp.fromDate(new Date(originalEndDate.getTime() + diff));
                break;
        }

        await db.collection('tasks').doc(draggedTask.id).update(updates);
    } catch (error) {
        showError('Error updating task: ' + error.message);
    }
}

// Dashboard functions
function renderDashboard() {
    renderCompactCalendar();
    updateTaskList();
    renderProjectStats();
}

function updateTaskList() {
    const taskList = document.getElementById('dashboardTaskList');
    const filteredTasks = tasks.filter(task => {
        const taskStart = new Date(task.start);
        const taskEnd = new Date(task.end);
        
        // Normalize dates to local midnight
        const selected = new Date(selectedDate);
        selected.setHours(0,0,0,0);
        
        const start = new Date(taskStart);
        start.setHours(0,0,0,0);
        
        const end = new Date(taskEnd);
        end.setHours(23,59,59,999);

        // Check if selected date is within task range
        const isWithinDateRange = selected >= start && selected <= end;
        
        // Check local date string for completion
        const localDateString = getLocalDateString(selectedDate);
        const isCompleted = (task.completedDates || []).includes(localDateString);
        
        return isWithinDateRange && !isCompleted;
    });

    taskList.innerHTML = filteredTasks.map(task => `
        <div class="task-item">
            <div>
                <h4>${task.text}</h4>
                <small>${formatDate(task.start)} - ${formatDate(task.end)}</small>
                <div class="task-meta">
                    <span class="priority-badge ${(task.priority || 'Medium').toLowerCase()}">
                        ${task.priority}
                    </span>
                </div>
            </div>
            <button onclick="toggleTask('${task.id}')">✓ Complete</button>
        </div>
    `).join('') || '<p>No tasks for selected date</p>';
}

function renderProjectStats() {
    const statsContainer = document.getElementById('projectStats');
    statsContainer.innerHTML = projects.map(project => {
        const progress = calculateProjectProgress(project.id);
        return `
            <div class="project-stat-item">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${project.name}</strong>
                    <span>${progress}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" 
                         style="width: ${progress}%;
                                transition: width 0.5s ease-out">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function calculateProjectProgress(projectId) {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) return 0;
    
    let totalDays = 0;
    let completedDays = 0;
    
    projectTasks.forEach(task => {
        const start = new Date(task.start);
        const end = new Date(task.end);
        
        const daysInTask = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        totalDays += daysInTask;

        if (task.status === 'Completed') {
            completedDays += daysInTask;
        } else {
            completedDays += (task.completedDates?.length || 0);
        }
    });
    
    const progress = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;
    
    return Math.round(progress);
}

// Utility functions
function changeMonth(offset, isCompact = false) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    if(isCompact) renderCompactCalendar();
    else renderMainCalendar();
    updateTaskList();
}

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
}

function getPriorityColor(priority) {
    switch(priority.toLowerCase()) {
        case 'high': return '#dc3545';
        case 'medium': return '#ffc107';
        case 'low': return '#28a745';
        default: return '#6c757d';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Timer functionality
let timerInterval;
let timerSeconds = 25 * 60;
let timerRunning = false;
let currentMode = 'pomodoro';
let completedPomodoros = 0;
let todayFocusTime = 0;

// Budget data
let budgetItems = [];
let totalBudget = 0;
let totalExpenses = 0;

// Initialize timer controls
document.addEventListener('DOMContentLoaded', () => {
    // Timer setup
    document.getElementById('startTimer').addEventListener('click', startTimer);
    document.getElementById('pauseTimer').addEventListener('click', pauseTimer);
    document.getElementById('resetTimer').addEventListener('click', resetTimer);
    
    // Timer mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            resetTimer();
        });
    });
    
    // Timer config inputs
    document.getElementById('pomodoroTime').addEventListener('change', updateTimerSettings);
    document.getElementById('shortBreakTime').addEventListener('change', updateTimerSettings);
    document.getElementById('longBreakTime').addEventListener('change', updateTimerSettings);
    
    // Budget form
    document.getElementById('budgetForm').addEventListener('submit', handleBudgetSubmit);
    
    // Load timer settings from localStorage
    loadTimerSettings();
    updateTimerDisplay();
    
    // Load budget data from Firebase
    setupBudgetListeners();
});

// Timer functions
function startTimer() {
    if (timerRunning) return;
    
    timerRunning = true;
    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            timerRunning = false;
            handleTimerComplete();
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
}

function resetTimer() {
    pauseTimer();
    switch(currentMode) {
        case 'pomodoro':
            timerSeconds = parseInt(document.getElementById('pomodoroTime').value) * 60;
            break;
        case 'shortBreak':
            timerSeconds = parseInt(document.getElementById('shortBreakTime').value) * 60;
            break;
        case 'longBreak':
            timerSeconds = parseInt(document.getElementById('longBreakTime').value) * 60;
            break;
    }
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    document.getElementById('timerDisplay').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function handleTimerComplete() {
    // Play sound
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3');
    audio.play();
    
    if (currentMode === 'pomodoro') {
        completedPomodoros++;
        todayFocusTime += parseInt(document.getElementById('pomodoroTime').value);
        document.getElementById('completedPomodoros').textContent = completedPomodoros;
        document.getElementById('todayFocusTime').textContent = todayFocusTime;
        
        // Save to Firebase
        savePomodoroSession();
        
        // Switch to short break after 4 pomodoros
        if (completedPomodoros % 4 === 0) {
            currentMode = 'longBreak';
        } else {
            currentMode = 'shortBreak';
        }
        
        // Update UI
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.mode-btn[data-mode="${currentMode}"]`).classList.add('active');
    }
    
    resetTimer();
    startTimer();
}

function updateTimerSettings() {
    saveTimerSettings();
    resetTimer();
}

function saveTimerSettings() {
    const settings = {
        pomodoroTime: document.getElementById('pomodoroTime').value,
        shortBreakTime: document.getElementById('shortBreakTime').value,
        longBreakTime: document.getElementById('longBreakTime').value,
        completedPomodoros: completedPomodoros,
        todayFocusTime: todayFocusTime
    };
    localStorage.setItem('timerSettings', JSON.stringify(settings));
}

function loadTimerSettings() {
    const savedSettings = localStorage.getItem('timerSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        document.getElementById('pomodoroTime').value = settings.pomodoroTime || 25;
        document.getElementById('shortBreakTime').value = settings.shortBreakTime || 5;
        document.getElementById('longBreakTime').value = settings.longBreakTime || 15;
        completedPomodoros = settings.completedPomodoros || 0;
        todayFocusTime = settings.todayFocusTime || 0;
        
        document.getElementById('completedPomodoros').textContent = completedPomodoros;
        document.getElementById('todayFocusTime').textContent = todayFocusTime;
    }
}

async function savePomodoroSession() {
    try {
        await db.collection('pomodoroSessions').add({
            date: firebase.firestore.FieldValue.serverTimestamp(),
            duration: parseInt(document.getElementById('pomodoroTime').value),
            projectId: null, // Can be enhanced to track per project
            completed: true
        });
    } catch (error) {
        console.error('Error saving pomodoro session:', error);
    }
}

// Budget functions
function setupBudgetListeners() {
    // Budget items listener
    db.collection('budgetItems').onSnapshot(snapshot => {
        budgetItems = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate?.() || new Date(data.date),
                amount: parseFloat(data.amount)
            };
        });
        renderBudgetSummary();
        renderTransactionList();
        updateBudgetProjectSelect();
    });
}

function updateBudgetProjectSelect() {
    const select = document.getElementById('budgetProjectSelect');
    select.innerHTML = `
        <option value="">Select Project</option>
        ${projects.map(p => `
            <option value="${p.id}">${p.name}</option>
        `).join('')}
        <option value="general">General</option>
    `;
}

async function handleBudgetSubmit(e) {
    e.preventDefault();
    
    const projectId = document.getElementById('budgetProjectSelect').value;
    const type = document.getElementById('budgetType').value;
    const description = document.getElementById('budgetDescription').value.trim();
    const amount = parseFloat(document.getElementById('budgetAmount').value);
    const date = new Date(document.getElementById('budgetDate').value);
    const category = document.getElementById('budgetCategory').value;
    
    if (!projectId || !description || isNaN(amount) || amount <= 0) {
        showError('Please fill all required fields with valid values');
        return;
    }
    
    const budgetItem = {
        projectId: projectId === 'general' ? null : projectId,
        type,
        description,
        amount,
        date: firebase.firestore.Timestamp.fromDate(date),
        category,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('budgetItems').add(budgetItem);
        e.target.reset();
        document.getElementById('budgetDate').valueAsDate = new Date();
    } catch (error) {
        showError('Error adding budget item: ' + error.message);
    }
}

function renderBudgetSummary() {
    totalBudget = budgetItems
        .filter(item => item.type === 'income')
        .reduce((sum, item) => sum + item.amount, 0);
    
    totalExpenses = budgetItems
        .filter(item => item.type === 'expense')
        .reduce((sum, item) => sum + item.amount, 0);
    
    const remaining = totalBudget - totalExpenses;
    
    document.getElementById('totalBudget').textContent = `$${totalBudget.toFixed(2)}`;
    document.getElementById('totalExpenses').textContent = `$${totalExpenses.toFixed(2)}`;
    document.getElementById('remainingBudget').textContent = `$${remaining.toFixed(2)}`;
    
    // Color coding
    document.getElementById('remainingBudget').style.color = 
        remaining >= 0 ? '#4CAF50' : '#f44336';
}

function renderTransactionList() {
    const transactionList = document.getElementById('transactionList');
    
    // Sort by date (newest first)
    const sortedItems = [...budgetItems].sort((a, b) => b.date - a.date);
    
    transactionList.innerHTML = sortedItems.map(item => `
        <div class="transaction-item ${item.type}">
            <div class="transaction-details">
                <div class="transaction-description">${item.description}</div>
                <div class="transaction-project">
                    ${item.projectId ? 
                        projects.find(p => p.id === item.projectId)?.name || 'Unknown Project' : 
                        'General'}
                </div>
                <div class="transaction-date">${formatDate(item.date)}</div>
            </div>
            <div class="transaction-amount ${item.type}">
                ${item.type === 'income' ? '+' : '-'}$${item.amount.toFixed(2)}
            </div>
            <button class="delete-transaction" onclick="deleteBudgetItem('${item.id}')">×</button>
        </div>
    `).join('') || '<p>No transactions yet</p>';
}

async function deleteBudgetItem(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
        await db.collection('budgetItems').doc(id).delete();
    } catch (error) {
        showError('Error deleting transaction: ' + error.message);
    }
}

let currentNoteId = null;

function openNoteEditor(noteId = null) {
    currentNoteId = noteId;
    const modal = document.getElementById('noteModal');
    modal.style.display = 'block';
    
    if(noteId) {
        const note = notes.find(n => n.id === noteId);
        document.getElementById('noteTitle').value = note.title;
        document.getElementById('noteContent').value = note.content;
        document.getElementById('noteModalTitle').textContent = 'Edit Note';
    } else {
        document.getElementById('noteForm').reset();
        document.getElementById('noteModalTitle').textContent = 'New Note';
    }
}

function closeNoteEditor() {
    document.getElementById('noteModal').style.display = 'none';
    currentNoteId = null;
}

async function saveNote(e) {
    e.preventDefault();
    
    // Check if notesCollection is initialized
    if (!notesCollection) {
        showError('Notes database not yet initialized. Please try again.');
        return;
    }
    
    const noteData = {
        title: document.getElementById('noteTitle').value,
        content: document.getElementById('noteContent').value,
        lastModified: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if(currentNoteId) {
            await notesCollection.doc(currentNoteId).update(noteData);
        } else {
            await notesCollection.add(noteData);
        }
        closeNoteEditor();
    } catch (error) {
        console.error("Error saving note:", error);
        showError('Failed to save note: ' + error.message);
    }
}

function deleteNote(noteId) {
    if(confirm('Delete this note permanently?')) {
        notesCollection.doc(noteId).delete();
    }
}

function renderNotes() {
    console.log('Rendering notes, total notes:', notes.length);
    
    // Make sure the notes container exists
    const container = document.getElementById('notesContainer');
    if (!container) {
        console.error('Notes container not found in DOM');
        return;
    }
    
    // Generate HTML for notes
    container.innerHTML = notes.length > 0 
        ? notes.map(note => `
            <div class="note-card" onclick="openNoteEditor('${note.id}')">
                <h3 class="note-title">${note.title || 'Untitled Note'}</h3>
                <div class="note-content">${note.content}</div>
                <div class="note-date">${formatDate(note.lastModified?.toDate())}</div>
                <button class="delete-note-btn" onclick="event.stopPropagation(); deleteNote('${note.id}')">
                    Delete
                </button>
            </div>
        `).join('')
        : '<div class="empty-notes"><p>No notes yet. Click "New Note" to create one.</p></div>';
}