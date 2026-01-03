<template>
  <div class="json-node">
    <!-- Expandable (Object/Array) -->
    <div v-if="isExpandable" class="flex items-start">
      <button @click="toggle" class="w-4 h-4 flex items-center justify-center text-txt-muted hover:text-txt shrink-0 mr-1">
        <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-90': isExpanded }" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
        </svg>
      </button>
      <span v-if="keyName !== undefined" class="text-purple-400 mr-1" :class="{ 'bg-warning/20 px-1 rounded': isKeyMatch }">
        "{{ keyName }}"<span class="text-txt-muted">:</span>
      </span>
      <span class="text-txt-muted">{{ isArray ? '[' : '{' }}</span>
      <span v-if="!isExpanded" class="text-txt-muted ml-1">
        {{ isArray ? `${data.length} items` : `${Object.keys(data).length} keys` }}
      </span>
      <span v-if="!isExpanded" class="text-txt-muted ml-1">{{ isArray ? ']' : '}' }}</span>
      <button @click="copyValue" class="ml-2 text-txt-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity" title="Copy">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
      </button>
    </div>
    
    <!-- Children -->
    <div v-if="isExpandable && isExpanded" class="ml-4 border-l border-line/30 pl-2">
      <div v-for="(value, key) in data" :key="key" class="group">
        <JsonNode
          :data="value"
          :keyName="isArray ? undefined : key"
          :path="[...path, String(key)]"
          :search="search"
          :expandedPaths="expandedPaths"
          @toggle="$emit('toggle', $event)"
          @copy="$emit('copy', $event)"
        />
      </div>
      <span class="text-txt-muted">{{ isArray ? ']' : '}' }}</span>
    </div>
    
    <!-- Primitive Values -->
    <div v-else-if="!isExpandable" class="flex items-center group">
      <span class="w-4 mr-1"></span>
      <span v-if="keyName !== undefined" class="text-purple-400 mr-1" :class="{ 'bg-warning/20 px-1 rounded': isKeyMatch }">
        "{{ keyName }}"<span class="text-txt-muted">:</span>
      </span>
      <span :class="valueClass" class="break-all" :title="String(data)">
        <template v-if="type === 'string'">"<span :class="{ 'bg-warning/20 px-0.5 rounded': isValueMatch }">{{ truncatedValue }}</span>"</template>
        <template v-else-if="type === 'null'">null</template>
        <template v-else>{{ data }}</template>
      </span>
      <button @click="copyValue" class="ml-2 text-txt-muted hover:text-primary opacity-0 group-hover:opacity-100" title="Copy">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  data: { required: true },
  keyName: { default: undefined },
  path: { type: Array, default: () => [] },
  search: { type: String, default: '' },
  expandedPaths: { type: Set, default: () => new Set() }
});

const emit = defineEmits(['toggle', 'copy']);

const pathStr = computed(() => props.path.join('.'));
const type = computed(() => {
  if (props.data === null) return 'null';
  if (Array.isArray(props.data)) return 'array';
  return typeof props.data;
});

const isArray = computed(() => type.value === 'array');
const isObject = computed(() => type.value === 'object');
const isExpandable = computed(() => isArray.value || isObject.value);
const isExpanded = computed(() => props.expandedPaths.has(pathStr.value));

const isKeyMatch = computed(() => props.search && props.keyName?.toLowerCase().includes(props.search.toLowerCase()));
const isValueMatch = computed(() => props.search && type.value === 'string' && String(props.data).toLowerCase().includes(props.search.toLowerCase()));

const truncatedValue = computed(() => {
  const str = String(props.data);
  return str.length > 100 ? str.slice(0, 100) + '...' : str;
});

const valueClass = computed(() => {
  switch (type.value) {
    case 'string': return 'text-green-400';
    case 'number': return 'text-blue-400';
    case 'boolean': return 'text-orange-400';
    case 'null': return 'text-txt-muted italic';
    default: return 'text-txt';
  }
});

function toggle() { emit('toggle', pathStr.value); }
function copyValue() { emit('copy', pathStr.value); }
</script>
