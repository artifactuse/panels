<template>
  <div class="form-fields-wrapper">
    <div :class="layoutClass">
      <FieldRenderer
        v-for="field in fields"
        :key="field.name || field.id"
        :field="field"
        :modelValue="formValues[field.name]"
        :formId="formId"
        ref="fieldRefs"
        :class="getFieldClass(field)"
        @update:modelValue="updateField(field.name, $event)"
        @validate="handleValidation"
        @button-click="handleButtonClick"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import FieldRenderer from './FieldRenderer.vue';

const props = defineProps({
  fields: { type: Array, required: true },
  formId: { type: String, default: 'form' },
  layout: { type: String, default: 'vertical' },
  columns: { type: Number, default: 2 },
  gap: { type: String, default: 'normal' }, // 'compact', 'normal', 'relaxed'
  initialValues: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:values', 'validate', 'button-click']);

const formValues = ref({ ...props.initialValues });
const fieldRefs = ref([]);
const validationErrors = ref({});

const gapSizes = {
  compact: 'gap-3',
  normal: 'gap-5',
  relaxed: 'gap-7'
};

const layoutClass = computed(() => {
  const gapClass = gapSizes[props.gap] || gapSizes.normal;
  
  if (props.layout === 'grid') {
    return `grid ${gapClass} grid-cols-1 md:grid-cols-${props.columns}`;
  }
  if (props.layout === 'horizontal') {
    return `flex flex-wrap ${gapClass}`;
  }
  // vertical (default)
  return `flex flex-col ${gapClass}`;
});

function getFieldClass(field) {
  const classes = [];
  
  // Handle field spanning in grid layout
  if (props.layout === 'grid' && field.span) {
    classes.push(`md:col-span-${field.span}`);
  }
  
  // Full width fields
  if (field.fullWidth) {
    classes.push('md:col-span-full');
  }
  
  // Custom width for horizontal layout
  if (props.layout === 'horizontal' && field.width) {
    classes.push(field.width);
  }
  
  return classes.join(' ');
}

function updateField(name, value) {
  formValues.value[name] = value;
  emit('update:values', formValues.value);
}

function handleValidation({ name, valid, error }) {
  if (valid) delete validationErrors.value[name];
  else validationErrors.value[name] = error;
  emit('validate', { name, valid, error, allErrors: validationErrors.value });
}

function handleButtonClick(data) {
  emit('button-click', data);
}

function validateAll() {
  let isValid = true;
  for (const field of props.fields) {
    const value = formValues.value[field.name];
    if (field.required && !value && value !== 0 && value !== false) {
      validationErrors.value[field.name] = `${field.label || 'Field'} is required`;
      isValid = false;
    }
  }
  fieldRefs.value?.forEach(ref => {
    if (ref?.validate && !ref.validate()) isValid = false;
  });
  return isValid;
}

function getValues() { return formValues.value; }
function setValues(values) { formValues.value = { ...formValues.value, ...values }; }
function reset() { formValues.value = { ...props.initialValues }; validationErrors.value = {}; }

watch(() => props.initialValues, (v) => { formValues.value = { ...formValues.value, ...v }; }, { deep: true });

defineExpose({ validateAll, getValues, setValues, reset });
</script>

<style scoped>
.form-fields-wrapper {
  flex: 1;
}
</style>