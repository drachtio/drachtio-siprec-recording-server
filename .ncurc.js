module.exports = {
  target: (dependencyName) => {
    if (['tape', 'clear-require'].includes(dependencyName))
      return 'minor';
    return 'latest';
  }
}
