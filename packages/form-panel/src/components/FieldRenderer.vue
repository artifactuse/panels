<template>
  <!-- `field-${field.type}` -->
  <div 
    class="field-wrapper" 
    :class="[
      { 'has-error': error, 'has-value': hasValue, 'is-focused': isFocused },
    
    ]"
  >
    <!-- Label (for most field types) -->
    <label 
      v-if="field.label && !isCheckbox && !isToggle" 
      :for="fieldId" 
      class="field-label"
      :class="{ 'label-required': field.required }"
    >
      <span class="label-text">{{ field.label }}</span>
      <span v-if="field.required" class="label-required-dot"></span>
    </label>
    
    <!-- Text Inputs -->
    <div v-if="isTextInput" class="input-wrapper">
      <div v-if="field.icon" class="input-icon">
        <component :is="getIcon(field.icon)" />
      </div>
      <input
        :id="fieldId"
        :type="showPassword ? 'text' : field.type"
        :value="modelValue"
        :placeholder="field.placeholder"
        :disabled="field.disabled"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        class="field-input"
        :class="{ 'has-icon': field.icon, 'has-suffix': field.type === 'password' }"
        @input="$emit('update:modelValue', field.type === 'number' ? Number($event.target.value) : $event.target.value)"
        @blur="onBlur"
        @focus="isFocused = true"
      />
      <button 
        v-if="field.type === 'password'" 
        type="button" 
        class="input-suffix-btn"
        @click="showPassword = !showPassword"
        tabindex="-1"
      >
        <svg v-if="showPassword" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
        </svg>
        <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
      </button>
      <div class="input-border"></div>
    </div>
    
    <!-- Textarea -->
    <div v-else-if="field.type === 'textarea'" class="input-wrapper textarea-wrapper">
      <textarea
        :id="fieldId"
        :value="modelValue"
        :placeholder="field.placeholder"
        :disabled="field.disabled"
        :rows="field.rows || 4"
        class="field-textarea"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="onBlur"
        @focus="isFocused = true"
      ></textarea>
      <div class="input-border"></div>
      <span v-if="field.maxLength" class="textarea-counter">
        {{ (modelValue || '').length }} / {{ field.maxLength }}
      </span>
    </div>
    
    <!-- Select -->
    <div v-else-if="field.type === 'select'" class="input-wrapper select-wrapper">
      <select
        :id="fieldId"
        :value="modelValue"
        :disabled="field.disabled"
        class="field-select"
        @change="$emit('update:modelValue', $event.target.value)"
        @blur="onBlur"
        @focus="isFocused = true"
      >
        <option value="" disabled>{{ field.placeholder || 'Select an option...' }}</option>
        <option 
          v-for="opt in field.options" 
          :key="opt.value" 
          :value="opt.value" 
          :disabled="opt.disabled"
        >
          {{ opt.label }}
        </option>
      </select>
      <div class="select-arrow">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>
      <div class="input-border"></div>
    </div>
    
    <!-- Multiselect (Checkboxes in a card grid) -->
    <div v-else-if="field.type === 'multiselect'" class="multiselect-grid">
      <label
        v-for="opt in field.options"
        :key="opt.value"
        class="multiselect-option"
        :class="{ 
          'is-selected': (modelValue || []).includes(opt.value),
          'is-disabled': opt.disabled || field.disabled
        }"
      >
        <input
          type="checkbox"
          :value="opt.value"
          :checked="(modelValue || []).includes(opt.value)"
          :disabled="opt.disabled || field.disabled"
          class="sr-only"
          @change="toggleMultiselect(opt.value)"
        />
        <span class="option-check">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </span>
        <span class="option-label">{{ opt.label }}</span>
        <span v-if="opt.description" class="option-description">{{ opt.description }}</span>
      </label>
    </div>
    
    <!-- Radio (Card style) -->
    <div v-else-if="field.type === 'radio'" class="radio-group" :class="{ 'radio-inline': field.inline }">
      <label
        v-for="opt in field.options"
        :key="opt.value"
        class="radio-option"
        :class="{ 
          'is-selected': modelValue === opt.value,
          'is-disabled': opt.disabled || field.disabled
        }"
      >
        <input
          type="radio"
          :name="fieldId"
          :value="opt.value"
          :checked="modelValue === opt.value"
          :disabled="opt.disabled || field.disabled"
          class="sr-only"
          @change="$emit('update:modelValue', opt.value)"
        />
        <span class="radio-indicator">
          <span class="radio-dot"></span>
        </span>
        <span class="radio-content">
          <span class="radio-label">{{ opt.label }}</span>
          <span v-if="opt.description" class="radio-description">{{ opt.description }}</span>
        </span>
      </label>
    </div>
    
    <!-- Checkbox -->
    <label v-else-if="field.type === 'checkbox'" class="checkbox-wrapper" :for="fieldId">
      <div class="checkbox-box" :class="{ 'is-checked': modelValue }">
        <input
          :id="fieldId"
          type="checkbox"
          :checked="modelValue"
          :disabled="field.disabled"
          class="sr-only"
          @change="$emit('update:modelValue', $event.target.checked)"
        />
        <svg class="checkbox-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div class="checkbox-content">
        <span class="checkbox-label">{{ field.label }}</span>
        <span v-if="field.description" class="checkbox-description">{{ field.description }}</span>
      </div>
    </label>
    
    <!-- Toggle -->
    <label v-else-if="field.type === 'toggle'" class="toggle-wrapper" :for="fieldId">
      <div class="toggle-content">
        <span class="toggle-label">{{ field.label }}</span>
        <span v-if="field.description" class="toggle-description">{{ field.description }}</span>
      </div>
      <div class="toggle-switch" :class="{ 'is-active': modelValue }">
        <input
          :id="fieldId"
          type="checkbox"
          :checked="modelValue"
          :disabled="field.disabled"
          class="sr-only"
          @change="$emit('update:modelValue', $event.target.checked)"
        />
        <span class="toggle-track"></span>
        <span class="toggle-knob"></span>
      </div>
    </label>
    
    <!-- Date/Time -->
    <div v-else-if="isDateInput" class="input-wrapper">
      <div class="input-icon">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      </div>
      <input
        :id="fieldId"
        :type="dateInputType"
        :value="modelValue"
        :disabled="field.disabled"
        :min="field.min"
        :max="field.max"
        class="field-input has-icon"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="onBlur"
        @focus="isFocused = true"
      />
      <div class="input-border"></div>
    </div>
    
    <!-- Range Slider -->
    <div v-else-if="field.type === 'range'" class="range-wrapper">
      <div class="range-header">
        <span class="range-min">{{ field.min || 0 }}</span>
        <span class="range-value">{{ modelValue }}</span>
        <span class="range-max">{{ field.max || 100 }}</span>
      </div>
      <div class="range-track-wrapper">
        <input
          :id="fieldId"
          type="range"
          :value="modelValue"
          :disabled="field.disabled"
          :min="field.min || 0"
          :max="field.max || 100"
          :step="field.step || 1"
          class="range-input"
          @input="$emit('update:modelValue', Number($event.target.value))"
        />
        <div class="range-track">
          <div class="range-fill" :style="{ width: rangePercent + '%' }"></div>
        </div>
      </div>
    </div>
    
    <!-- Rating -->
    <div v-else-if="field.type === 'rating'" class="rating-wrapper">
      <div class="rating-stars">
        <button
          v-for="star in (field.max || 5)"
          :key="star"
          type="button"
          class="rating-star"
          :class="{ 
            'is-active': star <= (hoverRating || modelValue),
            'is-hovered': hoverRating && star <= hoverRating
          }"
          :disabled="field.disabled"
          @click="$emit('update:modelValue', star)"
          @mouseenter="hoverRating = star"
          @mouseleave="hoverRating = 0"
        >
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      </div>
      <span v-if="modelValue" class="rating-label">{{ getRatingLabel(modelValue) }}</span>
    </div>
    
    <!-- File Upload -->
    <div v-else-if="field.type === 'file'" class="file-wrapper">
      <input
        :id="fieldId"
        type="file"
        :accept="field.accept"
        :multiple="field.multiple"
        :disabled="field.disabled"
        class="sr-only"
        @change="handleFileChange"
      />
      <label
        :for="fieldId"
        class="file-dropzone"
        :class="{ 'has-files': selectedFiles.length, 'is-dragover': isDragover }"
        @dragover.prevent="isDragover = true"
        @dragleave="isDragover = false"
        @drop.prevent="handleDrop"
      >
        <div class="file-icon">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
        </div>
        <div class="file-text">
          <span class="file-title">{{ selectedFiles.length ? `${selectedFiles.length} file(s) selected` : 'Drop files here or click to upload' }}</span>
          <span class="file-hint">{{ field.accept ? `Accepts: ${field.accept}` : 'Any file type' }}</span>
        </div>
      </label>
      <TransitionGroup name="file-list" tag="div" class="file-list">
        <div v-for="(file, idx) in selectedFiles" :key="file.name + idx" class="file-item">
          <div class="file-item-icon">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div class="file-item-info">
            <span class="file-item-name">{{ file.name }}</span>
            <span class="file-item-size">{{ formatFileSize(file.size) }}</span>
          </div>
          <button type="button" class="file-item-remove" @click="removeFile(idx)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
    
    <!-- Color Picker -->
    <div v-else-if="field.type === 'color'" class="color-wrapper">
      <div class="color-preview" :style="{ backgroundColor: modelValue || '#000000' }">
        <input
          :id="fieldId"
          type="color"
          :value="modelValue || '#000000'"
          :disabled="field.disabled"
          class="color-input"
          @input="$emit('update:modelValue', $event.target.value)"
        />
      </div>
      <div class="color-info">
        <span class="color-hex">{{ modelValue || '#000000' }}</span>
        <div class="color-presets" v-if="field.presets?.length">
          <button
            v-for="preset in field.presets"
            :key="preset"
            type="button"
            class="color-preset"
            :class="{ 'is-active': modelValue === preset }"
            :style="{ backgroundColor: preset }"
            @click="$emit('update:modelValue', preset)"
          ></button>
        </div>
      </div>
    </div>
    
    <!-- Button -->
    <button
      v-else-if="field.type === 'button'"
      type="button"
      :class="getButtonClass(field.style)"
      :disabled="field.disabled"
      @click="$emit('button-click', { id: field.id, field })"
    >
      {{ field.label }}
    </button>
    
    <!-- Hidden -->
    <input v-else-if="field.type === 'hidden'" type="hidden" :value="modelValue" />
    
    <!-- Help text -->
    <p v-if="field.helpText && !error" class="field-help">
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      {{ field.helpText }}
    </p>
    
    <!-- Error message -->
    <Transition name="error">
      <p v-if="error" class="field-error">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        {{ error }}
      </p>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: null },
  formId: { type: String, default: 'form' }
});

const emit = defineEmits(['update:modelValue', 'validate', 'button-click']);

const fieldId = computed(() => `${props.formId}-${props.field.name}`);
const error = ref(null);
const selectedFiles = ref([]);
const isFocused = ref(false);
const showPassword = ref(false);
const hoverRating = ref(0);
const isDragover = ref(false);

const isTextInput = computed(() => ['text', 'email', 'password', 'tel', 'url', 'number', 'search'].includes(props.field.type));
const isDateInput = computed(() => ['date', 'time', 'datetime'].includes(props.field.type));
const isCheckbox = computed(() => props.field.type === 'checkbox');
const isToggle = computed(() => props.field.type === 'toggle');
const isButton = computed(() => props.field.type === 'button');
const dateInputType = computed(() => props.field.type === 'datetime' ? 'datetime-local' : props.field.type);
const hasValue = computed(() => props.modelValue !== null && props.modelValue !== undefined && props.modelValue !== '');

const rangePercent = computed(() => {
  const min = props.field.min || 0;
  const max = props.field.max || 100;
  const value = props.modelValue || min;
  return ((value - min) / (max - min)) * 100;
});

function onBlur() {
  isFocused.value = false;
  validate();
}

function validate() {
  error.value = null;
  const value = props.modelValue;
  
  if (props.field.required && !value && value !== 0 && value !== false) {
    error.value = `${props.field.label || 'This field'} is required`;
    emit('validate', { name: props.field.name, valid: false, error: error.value });
    return false;
  }
  
  for (const rule of props.field.validation || []) {
    if (rule.type === 'minLength' && value?.length < rule.value) { error.value = rule.message || `Minimum ${rule.value} characters required`; break; }
    if (rule.type === 'maxLength' && value?.length > rule.value) { error.value = rule.message || `Maximum ${rule.value} characters allowed`; break; }
    if (rule.type === 'pattern' && !new RegExp(rule.value).test(value)) { error.value = rule.message || 'Invalid format'; break; }
    if (rule.type === 'min' && value < rule.value) { error.value = rule.message || `Minimum value is ${rule.value}`; break; }
    if (rule.type === 'max' && value > rule.value) { error.value = rule.message || `Maximum value is ${rule.value}`; break; }
    if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { error.value = rule.message || 'Please enter a valid email address'; break; }
  }
  
  emit('validate', { name: props.field.name, valid: !error.value, error: error.value });
  return !error.value;
}

function toggleMultiselect(value) {
  const current = props.modelValue || [];
  const newValue = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
  emit('update:modelValue', newValue);
}

function handleFileChange(event) {
  const files = Array.from(event.target.files);
  selectedFiles.value = files;
  emit('update:modelValue', props.field.multiple ? files : files[0] || null);
}

function handleDrop(event) {
  isDragover.value = false;
  const files = Array.from(event.dataTransfer.files);
  if (props.field.multiple) {
    selectedFiles.value = [...selectedFiles.value, ...files];
  } else {
    selectedFiles.value = [files[0]];
  }
  emit('update:modelValue', props.field.multiple ? selectedFiles.value : selectedFiles.value[0] || null);
}

function removeFile(index) {
  selectedFiles.value.splice(index, 1);
  emit('update:modelValue', props.field.multiple ? [...selectedFiles.value] : null);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getRatingLabel(value) {
  const labels = props.field.labels || ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  return labels[value - 1] || '';
}

function getButtonClass(style) {
  const base = 'field-button';
  switch (style) {
    case 'primary': return `${base} field-button--primary`;
    case 'secondary': return `${base} field-button--secondary`;
    case 'ghost': return `${base} field-button--ghost`;
    case 'danger': return `${base} field-button--danger`;
    case 'success': return `${base} field-button--success`;
    default: return `${base} field-button--secondary`;
  }
}

function getIcon(iconName) {
  // Return a simple icon component or SVG based on icon name
  return {
    template: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
    </svg>`
  };
}

defineExpose({ validate });
</script>

<style scoped>
/* ========================================
   Base Field Wrapper
   ======================================== */
.field-wrapper {
  position: relative;
}

/* ========================================
   Labels
   ======================================== */
.field-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-txt-secondary, #a1a1aa);
  transition: color 0.2s ease;
}

.field-wrapper.is-focused .field-label {
  color: var(--accent, #60a5fa);
}

.field-wrapper.has-error .field-label {
  color: var(--color-error, #f87171);
}

.label-required-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #60a5fa);
}

/* ========================================
   Input Wrapper & Base Input
   ======================================== */
.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.field-input,
.field-textarea,
.field-select {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 0.9375rem;
  color: var(--color-txt, #e4e4e7);
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.03));
  border: 1px solid transparent;
  border-radius: 0.75rem;
  outline: none;
  transition: all 0.2s ease;
}

.field-input::placeholder,
.field-textarea::placeholder {
  color: var(--color-txt-muted, #52525b);
}

.field-input:disabled,
.field-textarea:disabled,
.field-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-input.has-icon {
  padding-left: 2.75rem;
}

.field-input.has-suffix {
  padding-right: 2.75rem;
}

/* Input icon */
.input-icon {
  position: absolute;
  left: 1rem;
  color: var(--color-txt-muted, #52525b);
  pointer-events: none;
  transition: color 0.2s ease;
}

.field-wrapper.is-focused .input-icon {
  color: var(--accent, #60a5fa);
}

/* Password toggle button */
.input-suffix-btn {
  position: absolute;
  right: 0.75rem;
  padding: 0.375rem;
  color: var(--color-txt-muted, #52525b);
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.input-suffix-btn:hover {
  color: var(--color-txt, #e4e4e7);
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
}

/* Animated border */
.input-border {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent, #60a5fa);
  border-radius: 0 0 0.75rem 0.75rem;
  transform: scaleX(0);
  transition: transform 0.3s ease;
}

.field-wrapper.is-focused .input-border {
  transform: scaleX(1);
}

.field-wrapper.has-error .input-border {
  background: var(--color-error, #f87171);
  transform: scaleX(1);
}

/* ========================================
   Textarea
   ======================================== */
.textarea-wrapper {
  flex-direction: column;
  align-items: stretch;
}

.field-textarea {
  min-height: 100px;
  resize: vertical;
  line-height: 1.6;
}

.textarea-counter {
  position: absolute;
  bottom: 0.5rem;
  right: 0.75rem;
  font-size: 0.75rem;
  color: var(--color-txt-muted, #52525b);
}

/* ========================================
   Select
   ======================================== */
.select-wrapper {
  position: relative;
}

.field-select {
  appearance: none;
  /* padding-right: 2.75rem; */
  cursor: pointer;
}

.select-arrow {
  position: absolute;
  right: 1rem;
  color: var(--color-txt-muted, #52525b);
  pointer-events: none;
  transition: transform 0.2s ease, color 0.2s ease;
}

.field-wrapper.is-focused .select-arrow {
  color: var(--accent, #60a5fa);
  transform: rotate(180deg);
}

/* ========================================
   Multiselect (Card Grid)
   ======================================== */
.multiselect-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}

.multiselect-option {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.03));
  border: 2px solid transparent;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.multiselect-option:hover {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
  border-color: var(--color-line, rgba(255, 255, 255, 0.1));
}

.multiselect-option.is-selected {
  background: rgba(var(--accent-rgb, 96, 165, 250), 0.1);
  border-color: var(--accent, #60a5fa);
}

.multiselect-option.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.option-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
  border: 2px solid var(--color-line, rgba(255, 255, 255, 0.1));
  border-radius: 0.375rem;
  color: transparent;
  transition: all 0.2s ease;
}

.multiselect-option.is-selected .option-check {
  background: var(--accent, #60a5fa);
  border-color: var(--accent, #60a5fa);
  color: white;
}

.option-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-txt, #e4e4e7);
}

.option-description {
  font-size: 0.75rem;
  color: var(--color-txt-muted, #52525b);
  line-height: 1.4;
}

/* ========================================
   Radio (Card Style)
   ======================================== */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.radio-group.radio-inline {
  flex-direction: row;
  flex-wrap: wrap;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.03));
  border: 2px solid transparent;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.radio-option:hover {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
  border-color: var(--color-line, rgba(255, 255, 255, 0.1));
}

.radio-option.is-selected {
  background: rgba(var(--accent-rgb, 96, 165, 250), 0.1);
  border-color: var(--accent, #60a5fa);
}

.radio-option.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.radio-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--color-line, rgba(255, 255, 255, 0.2));
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.125rem;
  transition: all 0.2s ease;
}

.radio-option.is-selected .radio-indicator {
  border-color: var(--accent, #60a5fa);
}

.radio-dot {
  width: 0.5rem;
  height: 0.5rem;
  background: var(--accent, #60a5fa);
  border-radius: 50%;
  transform: scale(0);
  transition: transform 0.2s ease;
}

.radio-option.is-selected .radio-dot {
  transform: scale(1);
}

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.radio-label {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--color-txt, #e4e4e7);
}

.radio-description {
  font-size: 0.8125rem;
  color: var(--color-txt-muted, #71717a);
  line-height: 1.4;
}

/* ========================================
   Checkbox
   ======================================== */
.checkbox-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  padding: 0.75rem 1rem;
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.03));
  border-radius: 0.75rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.checkbox-wrapper:hover {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
}

.checkbox-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
  border: 2px solid var(--color-line, rgba(255, 255, 255, 0.15));
  border-radius: 0.375rem;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.checkbox-box.is-checked {
  background: var(--accent, #60a5fa);
  border-color: var(--accent, #60a5fa);
}

.checkbox-icon {
  width: 0.875rem;
  height: 0.875rem;
  color: white;
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.2s ease;
}

.checkbox-box.is-checked .checkbox-icon {
  opacity: 1;
  transform: scale(1);
}

.checkbox-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.checkbox-label {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--color-txt, #e4e4e7);
}

.checkbox-description {
  font-size: 0.8125rem;
  color: var(--color-txt-muted, #71717a);
  line-height: 1.4;
}

/* ========================================
   Toggle Switch
   ======================================== */
.toggle-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1rem;
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.03));
  border-radius: 0.75rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.toggle-wrapper:hover {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
}

.toggle-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.toggle-label {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--color-txt, #e4e4e7);
}

.toggle-description {
  font-size: 0.8125rem;
  color: var(--color-txt-muted, #71717a);
}

.toggle-switch {
  position: relative;
  width: 3rem;
  height: 1.75rem;
  flex-shrink: 0;
}

.toggle-track {
  position: absolute;
  inset: 0;
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.1));
  border-radius: 999px;
  transition: background 0.3s ease;
}

.toggle-switch.is-active .toggle-track {
  background: var(--accent, #60a5fa);
}

.toggle-knob {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  width: 1.25rem;
  height: 1.25rem;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-switch.is-active .toggle-knob {
  transform: translateX(1.25rem);
}

/* ========================================
   Range Slider
   ======================================== */
.range-wrapper {
  padding: 0.5rem 0;
}

.range-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
  color: var(--color-txt-muted, #71717a);
}

.range-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--accent, #60a5fa);
}

.range-track-wrapper {
  position: relative;
  height: 1.5rem;
  display: flex;
  align-items: center;
}

.range-input {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}

.range-track {
  position: absolute;
  width: 100%;
  height: 0.5rem;
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.1));
  border-radius: 999px;
  overflow: hidden;
}

.range-fill {
  height: 100%;
  background: var(--accent, #60a5fa);
  border-radius: 999px;
  transition: width 0.1s ease;
}

/* ========================================
   Rating Stars
   ======================================== */
.rating-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.rating-stars {
  display: flex;
  gap: 0.25rem;
}

.rating-star {
  padding: 0.25rem;
  color: var(--color-panel-hover, rgba(255, 255, 255, 0.15));
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  transform-origin: center;
}

.rating-star:hover {
  transform: scale(1.15);
}

.rating-star.is-active {
  color: #fbbf24;
}

.rating-star.is-hovered {
  color: #fcd34d;
}

.rating-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-txt-secondary, #a1a1aa);
}

/* ========================================
   File Upload
   ======================================== */
.file-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.file-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.03));
  border: 2px dashed var(--color-line, rgba(255, 255, 255, 0.15));
  border-radius: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-dropzone:hover,
.file-dropzone.is-dragover {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
  border-color: var(--accent, #60a5fa);
}

.file-dropzone.has-files {
  padding: 1.25rem;
}

.file-icon {
  color: var(--color-txt-muted, #52525b);
  transition: color 0.2s ease;
}

.file-dropzone:hover .file-icon,
.file-dropzone.is-dragover .file-icon {
  color: var(--accent, #60a5fa);
}

.file-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  text-align: center;
}

.file-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-txt, #e4e4e7);
}

.file-hint {
  font-size: 0.75rem;
  color: var(--color-txt-muted, #71717a);
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.03));
  border-radius: 0.5rem;
}

.file-item-icon {
  color: var(--color-txt-muted, #71717a);
}

.file-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.file-item-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-txt, #e4e4e7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-item-size {
  font-size: 0.75rem;
  color: var(--color-txt-muted, #71717a);
}

.file-item-remove {
  padding: 0.375rem;
  color: var(--color-txt-muted, #71717a);
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-item-remove:hover {
  color: var(--color-error, #f87171);
  background: rgba(248, 113, 113, 0.1);
}

/* File list transitions */
.file-list-enter-active,
.file-list-leave-active {
  transition: all 0.3s ease;
}

.file-list-enter-from {
  opacity: 0;
  transform: translateY(-0.5rem);
}

.file-list-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}

/* ========================================
   Color Picker
   ======================================== */
.color-wrapper {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.color-preview {
  position: relative;
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.color-input {
  position: absolute;
  inset: 0;
  width: 200%;
  height: 200%;
  border: none;
  cursor: pointer;
  transform: translate(-25%, -25%);
}

.color-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.color-hex {
  font-family: ui-monospace, monospace;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-txt, #e4e4e7);
  text-transform: uppercase;
}

.color-presets {
  display: flex;
  gap: 0.375rem;
}

.color-preset {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid transparent;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.color-preset:hover {
  transform: scale(1.15);
}

.color-preset.is-active {
  border-color: white;
  box-shadow: 0 0 0 2px var(--accent, #60a5fa);
}

/* ========================================
   Help & Error Text
   ======================================== */
.field-help {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-txt-muted, #71717a);
}

.field-error {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-error, #f87171);
}

/* Error transition */
.error-enter-active,
.error-leave-active {
  transition: all 0.2s ease;
}

.error-enter-from,
.error-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}

/* ========================================
   Button Field
   ======================================== */
.field-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.5rem;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.field-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-button--primary {
  background: var(--accent, #60a5fa);
  color: white;
}

.field-button--primary:hover:not(:disabled) {
  background: var(--accent-hover, #3b82f6);
}

.field-button--secondary {
  background: var(--color-panel-surface, rgba(255, 255, 255, 0.05));
  color: var(--color-txt, #e4e4e7);
  border: 1px solid var(--color-line, rgba(255, 255, 255, 0.1));
}

.field-button--secondary:hover:not(:disabled) {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--color-line-hover, rgba(255, 255, 255, 0.2));
}

.field-button--ghost {
  background: transparent;
  color: var(--color-txt-secondary, #a1a1aa);
}

.field-button--ghost:hover:not(:disabled) {
  background: var(--color-panel-hover, rgba(255, 255, 255, 0.05));
  color: var(--color-txt, #e4e4e7);
}

.field-button--danger {
  background: var(--color-error, #ef4444);
  color: white;
}

.field-button--danger:hover:not(:disabled) {
  background: #dc2626;
}

.field-button--success {
  background: var(--color-success, #22c55e);
  color: white;
}

.field-button--success:hover:not(:disabled) {
  background: #16a34a;
}

/* ========================================
   Light Theme Adjustments
   ======================================== */
:global(.light) .field-label {
  color: var(--color-txt-secondary, #52525b);
}

:global(.light) .field-input,
:global(.light) .field-textarea,
:global(.light) .field-select {
  background: var(--color-panel-surface, rgba(0, 0, 0, 0.02));
}

:global(.light) .checkbox-wrapper,
:global(.light) .toggle-wrapper,
:global(.light) .radio-option,
:global(.light) .multiselect-option,
:global(.light) .file-dropzone,
:global(.light) .file-item {
  background: var(--color-panel-surface, rgba(0, 0, 0, 0.02));
}

:global(.light) .checkbox-wrapper:hover,
:global(.light) .toggle-wrapper:hover,
:global(.light) .radio-option:hover,
:global(.light) .multiselect-option:hover,
:global(.light) .file-dropzone:hover {
  background: var(--color-panel-hover, rgba(0, 0, 0, 0.04));
}
</style>