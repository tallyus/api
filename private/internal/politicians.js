'use strict';

window.onload = function() {
    get('/v1/politicians' + location.search, function(res) {
        if (res) {
            res.politicians.forEach(function(politician) {
                var p = document.createElement('p');
                p.textContent = politician.name + ' ';

                var edit = document.createElement('a');
                edit.href = '/internal/politician.html?iden=' + politician.iden;
                edit.style.fontWeight = 'bold';
                edit.textContent = 'Edit';

                p.appendChild(edit);

                var div = document.createElement('div');
                div.appendChild(p);

                document.body.appendChild(div);
            });
        } else {
            document.body.innerHTML = 'Unable to load politicians'
        }
    });
};
