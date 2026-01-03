<template>
  <div class="wizard-container">
    <!-- Progress Steps -->
    <div v-if="showProgress" class="wizard-header">
      <!-- Progress Bar (behind steps) -->
      <div class="wizard-progress-track">
        <div 
          class="wizard-progress-fill" 
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>
      
      <!-- Step Indicators -->
      <div class="wizard-steps">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="wizard-step"
          :class="{
            'is-completed': index < currentStep,
            'is-active': index === currentStep,
            'is-upcoming': index > currentStep
          }"
          @click="goToStep(index)"
        >
          <div class="step-indicator">
            <Transition name="step-check" mode="out-in">
              <svg v-if="index < currentStep" class="step-check" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              <span v-else class="step-number">{{ index + 1 }}</span>
            </Transition>
          </div>
          <div class="step-info">
            <span class="step-title">{{ step.title }}</span>
            <span v-if="step.subtitle" class="step-subtitle">{{ step.subtitle }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Step Content -->
    <div class="wizard-content">
      <TransitionGroup name="wizard-slide" tag="div" class="wizard-panels">
        <div 
          v-for="(step, index) in steps" 
          :key="step.id"
          v-show="index === currentStep"
          class="wizard-panel"
        >
          <div class="panel-header">
            <div class="panel-badge">Step {{ index + 1 }} of {{ steps.length }}</div>
            <h3 class="panel-title">{{ step.title }}</h3>
            <p v-if="step.description" class="panel-description">{{ step.description }}</p>
          </div>
          
          <div class="panel-fields">
            <FieldRenderer
              v-for="field in step.fields"
              :key="field.name"
              :field="field"
              :modelValue="formValues[field.name]"
              :formId="formId"
              ref="fieldRefs"
              @update:modelValue="updateField(field.name, $event)"
              @validate="handleValidation"
            />
          </div>
        </div>
      </TransitionGroup>
    </div>
    
    <!-- Navigation -->
    <div class="wizard-footer">
      <button 
        v-if="currentStep > 0" 
        type="button" 
        class="btn btn-secondary nav-btn"
        @click="prevStep"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        <span>Previous</span>
      </button>
      
      <div class="flex-1"></div>
      
      <button 
        v-if="allowSkip && currentStep < steps.length - 1" 
        type="button" 
        class="btn btn-ghost nav-btn"
        @click="nextStep(true)"
      >
        Skip this step
      </button>
      
      <button 
        v-if="currentStep < steps.length - 1" 
        type="button" 
        class="btn btn-primary nav-btn"
        @click="nextStep(false)"
      >
        <span>Continue</span>
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
      
      <button 
        v-else 
        type="button" 
        class="btn btn-success nav-btn"
        @click="submit"
      >
        <span>{{ submitLabel }}</span>
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import FieldRenderer from './FieldRenderer.vue';

const props = defineProps({
  steps: { type: Array, required: true },
  showProgress: { type: Boolean, default: true },
  allowSkip: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Complete' },
  formId: { type: String, default: 'wizard' },
  layout: { type: String, default: 'vertical' },
  initialValues: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['submit', 'step-change']);

const currentStep = ref(0);
const formValues = ref({ ...props.initialValues });
const fieldRefs = ref([]);
const validationErrors = ref({});

const currentStepData = computed(() => props.steps[currentStep.value]);
const progressPercent = computed(() => {
  if (props.steps.length <= 1) return 100;
  return (currentStep.value / (props.steps.length - 1)) * 100;
});

function updateField(name, value) { formValues.value[name] = value; }

function handleValidation({ name, valid, error }) {
  if (valid) delete validationErrors.value[name];
  else validationErrors.value[name] = error;
}

function validateCurrentStep() {
  let isValid = true;
  for (const field of currentStepData.value?.fields || []) {
    const value = formValues.value[field.name];
    if (field.required && !value && value !== 0 && value !== false) {
      validationErrors.value[field.name] = `${field.label || 'Field'} is required`;
      isValid = false;
    }
  }
  fieldRefs.value?.forEach(ref => { if (ref?.validate && !ref.validate()) isValid = false; });
  return isValid;
}

function nextStep(skip = false) {
  if (!skip && !validateCurrentStep()) return;
  if (currentStep.value < props.steps.length - 1) {
    currentStep.value++;
    emit('step-change', { step: currentStep.value, values: formValues.value });
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--;
    emit('step-change', { step: currentStep.value, values: formValues.value });
  }
}

function goToStep(index) {
  if (index < currentStep.value) {
    currentStep.value = index;
    emit('step-change', { step: currentStep.value, values: formValues.value });
  }
}

function submit() {
  if (!validateCurrentStep()) return;
  emit('submit', { values: formValues.value, steps: props.steps.map(s => s.id) });
}

watch(currentStep, () => { fieldRefs.value = []; });
</script>

<style scoped>
.wizard-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ========================================
   Wizard Header / Progress
   ======================================== */
.wizard-header {
  position: relative;
  padding: 1.5rem 1.5rem 2rem;
  border-bottom: 1px solid var(--color-line, rgba(255, 255, 255, 0.1));
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.02));
}

.wizard-progress-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
}

.wizard-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent, #60a5fa), var(--accent-light, #93c5fd));
  border-radius: 0 2px 2px 0;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.wizard-steps {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.wizard-step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  max-width: 200px;
}

.wizard-step.is-upcoming {
  opacity: 0.4;
  cursor: not-allowed;
}

.wizard-step.is-completed:hover,
.wizard-step.is-active:hover {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 600;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.wizard-step.is-upcoming .step-indicator {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
  color: var(--color-txt-muted, #71717a);
}

.wizard-step.is-active .step-indicator {
  background: var(--accent, #60a5fa);
  color: white;
  box-shadow: 0 0 0 4px rgba(var(--accent-rgb, 96, 165, 250), 0.2);
}

.wizard-step.is-completed .step-indicator {
  background: var(--color-success, #22c55e);
  color: white;
}

.step-check {
  width: 1rem;
  height: 1rem;
}

.step-number {
  line-height: 1;
}

.step-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.step-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-txt, #e4e4e7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wizard-step.is-upcoming .step-title {
  color: var(--color-txt-muted, #71717a);
}

.step-subtitle {
  font-size: 0.6875rem;
  color: var(--color-txt-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Step check animation */
.step-check-enter-active,
.step-check-leave-active {
  transition: all 0.2s ease;
}

.step-check-enter-from {
  opacity: 0;
  transform: scale(0.5);
}

.step-check-leave-to {
  opacity: 0;
  transform: scale(1.2);
}

/* ========================================
   Wizard Content
   ======================================== */
.wizard-content {
  flex: 1;
  overflow-y: auto;
  padding: 2rem 1.5rem;
}

.wizard-panels {
  position: relative;
}

.wizard-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.panel-header {
  margin-bottom: 0.5rem;
}

.panel-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent, #60a5fa);
  background: rgba(var(--accent-rgb, 96, 165, 250), 0.1);
  border-radius: 999px;
  margin-bottom: 0.75rem;
}

.panel-title {
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--color-txt, #e4e4e7);
  margin-bottom: 0.375rem;
}

.panel-description {
  font-size: 0.9375rem;
  color: var(--color-txt-secondary, #a1a1aa);
  line-height: 1.5;
}

.panel-fields {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Panel slide animation */
.wizard-slide-enter-active,
.wizard-slide-leave-active {
  transition: all 0.3s ease;
}

.wizard-slide-enter-from {
  opacity: 0;
  transform: translateX(1.5rem);
}

.wizard-slide-leave-to {
  opacity: 0;
  transform: translateX(-1.5rem);
}

/* ========================================
   Wizard Footer / Navigation
   ======================================== */
.wizard-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-line, rgba(255, 255, 255, 0.1));
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.02));
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

/* ========================================
   Responsive
   ======================================== */
@media (max-width: 640px) {
  .wizard-steps {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding-bottom: 0.5rem;
  }
  
  .wizard-steps::-webkit-scrollbar {
    display: none;
  }
  
  .wizard-step {
    flex: 0 0 auto;
    max-width: none;
  }
  
  .step-info {
    display: none;
  }
  
  .wizard-step.is-active .step-info {
    display: flex;
  }
}
</style>