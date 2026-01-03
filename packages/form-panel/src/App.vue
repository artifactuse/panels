<template>
  <div class="panel" :class="[themeClass, accentClass]">
    <!-- Header -->
    <div v-if="formData.title || formData.description" class="px-6 py-5 bg-panel-surface border-b border-line">
      <h2 v-if="formData.title" class="text-lg font-semibold text-txt">{{ formData.title }}</h2>
      <p v-if="formData.description" class="text-sm text-txt-secondary mt-1">{{ formData.description }}</p>
    </div>
    
    <!-- Form Content -->
    <div class="panel-content">
      <!-- Wizard variant -->
      <FormWizard
        v-if="formData.variant === 'wizard'"
        :steps="formData.data?.steps || []"
        :showProgress="formData.data?.showProgress !== false"
        :allowSkip="formData.data?.allowSkip"
        :submitLabel="formData.submitLabel || 'Submit'"
        :formId="formId"
        :layout="formData.data?.layout"
        :initialValues="initialValues"
        @submit="handleSubmit"
        @step-change="handleStepChange"
      />
      
      <!-- Buttons variant -->
      <div v-else-if="formData.variant === 'buttons'" class="flex flex-col items-center justify-center h-full p-6">
        <p v-if="formData.description" class="text-txt-secondary text-center mb-6 max-w-md">
          {{ formData.description }}
        </p>
        <div class="flex flex-wrap gap-3 justify-center">
          <button
            v-for="btn in buttonsFromData"
            :key="btn.id"
            :class="getButtonClass(btn.style)"
            :disabled="btn.disabled"
            @click="handleButtonClick(btn.id)"
          >
            {{ btn.label }}
          </button>
        </div>
      </div>
      
      <!-- Fields variant (default) -->
      <form
        v-else
        @submit.prevent="handleSubmit"
        class="flex flex-col h-full p-6"
      >
        <FormFields
          ref="formFieldsRef"
          :fields="formData.data?.fields || []"
          :formId="formId"
          :layout="formData.data?.layout || 'vertical'"
          :columns="formData.data?.columns"
          :initialValues="initialValues"
          @update:values="handleValuesUpdate"
          @button-click="handleFieldButtonClick"
        />
        
        <!-- Actions -->
        <div class="flex gap-3 justify-end mt-6 pt-6 border-t border-line">
          <button
            v-if="formData.cancelLabel"
            type="button"
            class="btn btn-secondary"
            @click="handleCancel"
          >
            {{ formData.cancelLabel }}
          </button>
          <button
            type="submit"
            class="btn btn-primary min-w-[100px]"
            :disabled="isSubmitting"
          >
            <svg v-if="isSubmitting" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            {{ formData.submitLabel || 'Submit' }}
          </button>
        </div>
      </form>
    </div>
    
    
    <!-- Success Overlay -->
    <Transition name="fade">
      <div v-if="submitSuccess" class="absolute inset-0 bg-panel-bg/95 flex items-center justify-center z-50">
        <div class="text-center animate-scale-in">
          <div class="w-16 h-16 bg-success rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-txt">Submitted Successfully</h3>
          <p class="text-txt-secondary mt-2">Your response has been recorded.</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { createBridge } from '@artifactuse/shared/bridge';
import { setAccentColor } from '@artifactuse/shared/theme';
import FormFields from './components/FormFields.vue';
import FormWizard from './components/FormWizard.vue';
import '@artifactuse/shared/styles.css';

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  theme: { type: String, default: 'dark' },
  accent: { type: String, default: '' }
});

const currentTheme = ref(props.theme);
const currentAccent = ref(props.accent);
const formData = reactive({
  type: 'form',
  id: '',
  display: 'panel',
  variant: 'fields',
  title: '',
  description: '',
  submitLabel: 'Submit',
  cancelLabel: '',
  data: { fields: [], layout: 'vertical' }
});

const formValues = ref({});
const initialValues = ref({});
const isSubmitting = ref(false);
const submitSuccess = ref(false);
const formFieldsRef = ref(null);

const formId = computed(() => formData.id || `form-${Date.now()}`);
const themeClass = computed(() => currentTheme.value === 'light' ? 'light' : '');

// Get buttons from fields array
const buttonsFromData = computed(() => {
  if (formData.data?.fields?.length) {
    return formData.data.fields.filter(f => f.type === 'button');
  }
  return [];
});

// Don't use accentClass for custom colors - setAccentColor handles it
const accentClass = computed(() => {
  const accent = currentAccent.value;
  // Only use class for preset names (no # or rgb)
  if (accent && !accent.startsWith('#') && !accent.startsWith('rgb')) {
    return `accent-${accent}`;
  }
  return '';
});

let bridge = null;

// Apply accent color (works with presets and custom colors)
function applyAccent(accent) {
  if (accent) {
    setAccentColor(accent);
    currentAccent.value = accent;
  }
}

function getButtonClass(style) {
  const base = 'btn';
  switch (style) {
    case 'primary': return `${base} btn-primary`;
    case 'secondary': return `${base} btn-secondary`;
    case 'danger': return `${base} btn-danger`;
    case 'success': return `${base} btn-success`;
    default: return `${base} btn-primary`;
  }
}

function loadFormData(data) {
  if (!data) return;
  const form = data.type === 'form' ? data : { ...formData, ...data };
  
  formData.id = form.id || formData.id;
  formData.variant = form.variant || 'fields';
  formData.title = form.title || '';
  formData.description = form.description || '';
  formData.submitLabel = form.submitLabel || 'Submit';
  formData.cancelLabel = form.cancelLabel || '';
  formData.data = form.data || { fields: [] };
  
  const fields = formData.variant === 'wizard'
    ? (formData.data.steps || []).flatMap(s => s.fields || [])
    : (formData.data.fields || []);
  
  const defaults = {};
  fields.forEach(field => {
    if (field.defaultValue !== undefined) defaults[field.name] = field.defaultValue;
    else if (field.type === 'multiselect') defaults[field.name] = [];
    else if (field.type === 'checkbox' || field.type === 'toggle') defaults[field.name] = false;
    else if (['number', 'range', 'rating'].includes(field.type)) defaults[field.name] = field.min || 0;
  });
  
  initialValues.value = defaults;
  formValues.value = { ...defaults };
}

function handleValuesUpdate(values) {
  formValues.value = values;
}

function handleStepChange({ step, values }) {
  formValues.value = values;
  bridge?.send('form:step', { formId: formId.value, step, values });
}

function handleButtonClick(action) {
  const submitData = {
    formId: formId.value,
    action,
    values: {},
    timestamp: Date.now()
  };
  bridge?.send('form:submit', submitData);
  window.parent?.postMessage({ type: 'artifactuse', action: 'form:submit', data: submitData }, '*');
}

function handleFieldButtonClick({ id }) {
  // Handle button clicks from fields array (same as buttons variant)
  handleButtonClick(id);
}

async function handleSubmit(wizardData) {
  const values = wizardData?.values || formFieldsRef.value?.getValues() || formValues.value;
  
  if (formData.variant !== 'wizard' && formFieldsRef.value) {
    if (!formFieldsRef.value.validateAll()) return;
  }
  
  isSubmitting.value = true;
  
  const submitData = {
    formId: formId.value,
    action: 'submit',
    values,
    timestamp: Date.now()
  };
  
  bridge?.send('form:submit', submitData);
  window.parent?.postMessage({ type: 'artifactuse', action: 'form:submit', data: submitData }, '*');
  
  setTimeout(() => {
    isSubmitting.value = false;
    submitSuccess.value = true;
    setTimeout(() => { submitSuccess.value = false; }, 2000);
  }, 500);
}

function handleCancel() {
  const cancelData = { formId: formId.value, action: 'cancel', values: formValues.value, timestamp: Date.now() };
  bridge?.send('form:cancel', cancelData);
  window.parent?.postMessage({ type: 'artifactuse', action: 'form:cancel', data: cancelData }, '*');
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  
  // Theme from URL
  const urlTheme = params.get('theme');
  if (urlTheme) currentTheme.value = urlTheme;
  
  // Accent from URL - supports presets and color codes
  const urlAccent = params.get('accent');
  if (urlAccent) applyAccent(urlAccent);
  
  // Data from URL
  const urlData = params.get('data');
  if (urlData) {
    try { loadFormData(JSON.parse(decodeURIComponent(urlData))); }
    catch (e) { console.error('Failed to parse URL data:', e); }
  }
  
  // Dev mode mock data
  if (!formData.data?.fields?.length && !formData.data?.steps?.length) {
    if (import.meta.env?.DEV || window.location.hostname === 'localhost') {
      import('@artifactuse/shared').then(mod => {
        if (mod.getMockData) {
          loadFormData(mod.getMockData('form'));
          console.log('[Form Panel] Loaded mock data');
        }
      }).catch(() => {});
    }
  }
  
  if (props.data && Object.keys(props.data).length) loadFormData(props.data);
  if (props.accent) applyAccent(props.accent);
  
  bridge = createBridge({ debug: import.meta.env?.DEV });
  bridge.on('setData', loadFormData);
  bridge.on('setTheme', (t) => { currentTheme.value = typeof t === 'string' ? t : t.theme; });
  bridge.on('setAccent', applyAccent);
  bridge.on('reset', () => {
    formValues.value = { ...initialValues.value };
    submitSuccess.value = false;
    formFieldsRef.value?.reset?.();
  });
  bridge.signalReady();
});

watch(() => props.data, (d) => d && loadFormData(d), { deep: true });
watch(() => props.theme, (t) => t && (currentTheme.value = t));
watch(() => props.accent, (a) => a && applyAccent(a));
</script>

<style>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.animate-scale-in {
  animation: scaleIn 0.3s ease-out;
}
@keyframes scaleIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>