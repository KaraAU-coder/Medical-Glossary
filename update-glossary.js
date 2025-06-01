#!/usr/bin/env node

/**
 * Medical Glossary Auto-Update Script
 * 
 * This script automatically processes and validates your CSV file
 * and updates the metadata for your medical glossary.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    csvFile: null, // Will be auto-detected
    metaFile: 'data/meta.json',
    summaryFile: 'UPDATE_SUMMARY.md',
    requiredFields: ['EN Term', 'ZH', 'FR', 'Category', 'Subcategory', 'Notes', 'Example_EN', 'Example_ZH', 'Example_FR']
};

/**
 * Find the latest CSV file in the directory
 */
function findLatestCSV() {
    const csvFiles = fs.readdirSync('.')
        .filter(file => file.endsWith('.csv'))
        .map(file => ({
            name: file,
            time: fs.statSync(file).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
    
    if (csvFiles.length === 0) {
        throw new Error('No CSV files found in directory');
    }
    
    console.log(`🔍 Found ${csvFiles.length} CSV file(s):`);
    csvFiles.forEach((file, index) => {
        const indicator = index === 0 ? '📄 LATEST' : '📁';
        const date = new Date(file.time).toLocaleString();
        console.log(`  ${indicator} ${file.name} (modified: ${date})`);
    });
    
    return csvFiles[0].name;
}

/**
 * Simple CSV parser (lightweight alternative to PapaParse)
 */
function parseCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length === 0) throw new Error('CSV file is empty');
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Parse data
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        if (values.length !== headers.length) continue;
        
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    
    return { data, headers };
}

/**
 * Parse a single CSV line with quote handling
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 2;
            } else {
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    
    values.push(current.trim());
    return values;
}

/**
 * Validate medical glossary data
 */
function validateData(data) {
    const results = {
        isValid: true,
        errors: [],
        warnings: [],
        stats: {}
    };
    
    const cleanData = [];
    const seenTerms = new Set();
    
    data.forEach((term, index) => {
        const rowNum = index + 2;
        const enTerm = term['EN Term'];
        
        // Skip invalid entries
        if (!enTerm || enTerm.trim() === '' || enTerm === 'EN Term') {
            results.warnings.push(`Row ${rowNum}: Skipping invalid/empty term`);
            return;
        }
        
        // Check for duplicates
        const termLower = enTerm.toLowerCase();
        if (seenTerms.has(termLower)) {
            results.warnings.push(`Row ${rowNum}: Duplicate term "${enTerm}" - skipping`);
            return;
        }
        
        seenTerms.add(termLower);
        cleanData.push(term);
        
        // Validate required fields
        CONFIG.requiredFields.forEach(field => {
            if (!term[field] || term[field].trim() === '') {
                results.warnings.push(`Row ${rowNum}: Missing ${field} for "${enTerm}"`);
            }
        });
    });
    
    // Generate statistics
    results.stats = {
        totalTerms: cleanData.length,
        originalCount: data.length,
        duplicatesRemoved: data.length - cleanData.length,
        categories: [...new Set(cleanData.map(t => t.Category).filter(Boolean))].sort(),
        subcategories: [...new Set(cleanData.map(t => t.Subcategory).filter(Boolean))].sort(),
        termsWithExamples: cleanData.filter(t => t.Example_EN && t.Example_ZH && t.Example_FR).length,
        termsWithNotes: cleanData.filter(t => t.Notes && t.Notes.trim()).length
    };
    
    results.cleanData = cleanData;
    return results;
}

/**
 * Update metadata file
 */
function updateMetadata(validation, sourceFile) {
    const meta = {
        title: 'Medical Glossary 1.0',
        description: 'Multilingual medical dictionary with comprehensive terminology',
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        generated: new Date().toISOString(),
        sourceFile: sourceFile,
        languages: ['en', 'zh', 'fr'],
        totalTerms: validation.stats.totalTerms,
        categories: validation.stats.categories,
        subcategories: validation.stats.subcategories.length,
        buildInfo: {
            buildDate: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            automation: 'auto-detect-latest-csv',
            termsWithExamples: validation.stats.termsWithExamples,
            termsWithNotes: validation.stats.termsWithNotes
        }
    };
    
    // Create data directory if needed
    const dataDir = path.dirname(CONFIG.metaFile);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.metaFile, JSON.stringify(meta, null, 2));
    return meta;
}

/**
 * Generate update summary
 */
function generateSummary(validation, meta, sourceFile) {
    const timestamp = new Date().toLocaleString();
    const stats = validation.stats;
    
    const summary = `# 📊 Medical Glossary Update Summary

**Last Updated:** ${timestamp}
**Source File:** ${sourceFile}
**Total Terms:** ${stats.totalTerms}
**Categories:** ${stats.categories.length}
**Subcategories:** ${stats.subcategories.length}

## 🔍 Auto-Detection Results
- **Latest CSV detected:** ${sourceFile}
- **File selection:** Automatically chose most recently modified CSV
- **Processing:** Successfully validated and processed

## 📈 Statistics
- **Original entries:** ${stats.originalCount}
- **Valid terms:** ${stats.totalTerms}
- **Duplicates removed:** ${stats.duplicatesRemoved}
- **Terms with complete examples:** ${stats.termsWithExamples}
- **Terms with notes:** ${stats.termsWithNotes}

## 📂 Categories
${stats.categories.map(cat => `- ${cat}`).join('\n')}

## ⚠️ Warnings
${validation.warnings.length > 0 ? validation.warnings.map(w => `- ${w}`).join('\n') : 'No warnings'}

## ❌ Errors
${validation.errors.length > 0 ? validation.errors.map(e => `- ${e}`).join('\n') : 'No errors'}

---
🌿 **Medical Glossary 1.0** - Auto-updated with latest CSV file!

> **How it works:** 
> 1. Scans directory for all CSV files
> 2. Automatically selects the most recently modified file
> 3. Processes and validates the data
> 4. Updates your medical glossary website

> **Next Steps:** 
> 1. Review any warnings above
> 2. Commit changes to Git
> 3. Your site will automatically update via GitHub Pages
`;
    
    fs.writeFileSync(CONFIG.summaryFile, summary);
    return summary;
}

/**
 * Main update function
 */
async function updateGlossary() {
    console.log('🏥 Medical Glossary Auto-Update');
    console.log('=====================================\n');
    
    try {
        // Auto-detect the latest CSV file
        console.log('🔍 Auto-detecting latest CSV file...');
        const latestCSV = findLatestCSV();
        CONFIG.csvFile = latestCSV;
        
        console.log(`📖 Reading ${CONFIG.csvFile}...`);
        const csvContent = fs.readFileSync(CONFIG.csvFile, 'utf8');
        
        console.log('🔍 Parsing and validating data...');
        const { data } = parseCSV(csvContent);
        const validation = validateData(data);
        
        console.log(`✅ Processed ${validation.stats.totalTerms} valid terms`);
        
        if (validation.warnings.length > 0) {
            console.log(`\n⚠️  ${validation.warnings.length} warnings:`);
            validation.warnings.slice(0, 5).forEach(w => console.log(`  • ${w}`));
            if (validation.warnings.length > 5) {
                console.log(`  • ... and ${validation.warnings.length - 5} more`);
            }
        }
        
        if (validation.errors.length > 0) {
            console.log(`\n❌ ${validation.errors.length} errors:`);
            validation.errors.forEach(e => console.log(`  • ${e}`));
            console.log('\n⚠️  Please fix errors before deploying.');
        }
        
        console.log('\n📄 Updating metadata...');
        const meta = updateMetadata(validation, CONFIG.csvFile);
        
        console.log('📋 Generating summary...');
        generateSummary(validation, meta, CONFIG.csvFile);
        
        // Copy latest CSV to standard name for website
        if (CONFIG.csvFile !== 'medical-glossary.csv') {
            fs.copyFileSync(CONFIG.csvFile, 'medical-glossary.csv');
            console.log('📋 Copied latest CSV to medical-glossary.csv for website');
        }
        
        console.log('\n🎉 Update completed successfully!');
        console.log(`📊 Source: ${CONFIG.csvFile}`);
        console.log(`📊 Final stats: ${validation.stats.totalTerms} terms, ${validation.stats.categories.length} categories`);
        
        if (validation.errors.length === 0) {
            console.log('✅ Ready for deployment!');
        }
        
    } catch (error) {
        console.error('\n❌ Update failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    updateGlossary();
}

module.exports = {
    updateGlossary,
    validateData,
    parseCSV
};