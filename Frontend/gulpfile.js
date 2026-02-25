const gulp = require('gulp');
const terser = require('gulp-terser');
const csso = require('gulp-csso');
const htmlmin = require('gulp-htmlmin');

// Minify JavaScript and copy to dist/js
gulp.task('minify-js', () => {
    console.log('Minifying JavaScript...');
    return gulp.src('js/*.js')
        .pipe(terser())
        .pipe(gulp.dest('dist/scripts'));
});

// Minify CSS and copy to dist/css
gulp.task('minify-css', () => {
    console.log('Minifying CSS...');
    return gulp.src('css/*.css')
        .pipe(csso())
        .pipe(gulp.dest('dist/styles'));
});

// Minify HTML and copy to dist
gulp.task('minify-html', () => {
    console.log('Minifying HTML...');
    return gulp.src('*.html')
        .pipe(htmlmin({ collapseWhitespace: true, removeComments: true }))
        .pipe(gulp.dest('dist'));
});

// Default task
gulp.task('default', gulp.parallel('minify-js', 'minify-css', 'minify-html'));