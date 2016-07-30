/*
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
// ======================================================================
// Utilities.
// ======================================================================
var periods = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'ANNUALLY'];
var period_names = $.map(periods, function(item, index) {
    return item.toLowerCase()
          .split('_')
          .map(function(i) { return i[0].toUpperCase() + i.substring(1); })
          .join(' ');
});

var weekdays = ['Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday'];

var weekdays_short = ['Su',
                      'Mo',
                      'Tu',
                      'We',
                      'Th',
                      'Fr',
                      'Sa'];

var months = ['January',
              'February',
              'March',
              'April',
              'May',
              'June',
              'July',
              'August',
              'September',
              'October',
              'November',
              'December'];

function isodate(date) {
    if (date == null)
        return undefined;
    if (typeof date === 'string')
        return date.replace(/-0/g, '-');
    var year = date.getFullYear();
    return year + '-' + (date.getMonth()+1) + '-' + date.getDate();
};

function from_isodate(date) {
    if (typeof date === 'object')
        return date;
    if (date == null)
        return undefined;
    var dateTimeParts = date.split("T");
    var dateParts = dateTimeParts[0].split("-");
    return new Date(dateParts[0], (dateParts[1] - 1), dateParts[2]);
};

function validator_required(input) {
    return $.trim(input.val()) !== '';
};

function get_invalid_fields(selector) {
    return selector.filter(function() {
        var validator = $(this).data('validator');
        if (!validator)
            return false;
        return !validator($(this));
    });
};

function get_invalid_field_targets(selector) {
    var invalid = get_invalid_fields(selector);
    return invalid.map(function(index, elem) {
        var target = $(elem).data('validator-target');
        return target ? target.get() : this;
    });
};

function validate_all(selector) {
    var invalid = get_invalid_fields(selector);
    invalid.addClass('error');
    return invalid.length == 0;
};

// ======================================================================
// Calendar
// ======================================================================
var SpiffCalendar = function(div, options) {
    this._div = div;
    var that = this;
    var settings = $.extend(true, {
        period: 'month',
        start: undefined,
        last: undefined,
        event_api: function() { return {}; },
        event_renderer: function(e) { return e; },
        event_popup: undefined,
        footnote_renderer: function(e) { return e; },
        on_move_event: function() {},
        on_refresh: function() {}
    }, options);
    var qtip_settings = {
        style: {
            classes: 'SpiffCalendarPopup qtip-light qtip-shadow',
        },
        show: {
            event: 'click',
            solo: true
        },
        hide: {
            fixed: true,
            event: 'unfocus'
        },
        events: {
            render: function(event, api) {
                $(window).bind('keydown', function(e) {
                    if (e.keyCode === 27) { api.hide(); }
                });
            },
            hide: function(event, api) {
                if (!event.originalEvent)
                    return;
                var target = $(event.originalEvent.target);
                if (target.closest('.ui-datepicker').length == 1
                        || target.closest('.SpiffCalendarPopup').length == 1)
                    event.preventDefault();
            }
        },
        position: {
            my: 'bottom center',
            target: 'mouse',
            viewport: this._div,
            adjust: {
                mouse: false
            }
        }
    };

    if (this._div.length != 1)
        throw new Error('selector needs to match exactly one element');
    this._div.addClass('SpiffCalendar');

    this._calendar_event = function(event_data, date) {
        var html = $('<div class="event"></div>');
        html.data('event', event_data);
        if (event_data.time)
            html.addClass('timed');
        if (event_data.freq_type != null && event_data.freq_type !== 'ONE_TIME')
            html.addClass('recurring');
        if (event_data.is_exception)
            html.addClass('exception');

        // Add a popup for viewing event details.
        if (settings.event_popup) {
            html.qtip($.extend(true, qtip_settings, {
                content: {
                    text: function(event, api) {
                        data = $.extend(true, event_data, {date: date});
                        settings.event_popup.update(data);
                        return settings.event_popup._div;
                    }
                },
            }));
            html.click(function(e) {
                e.stopPropagation();
            });
        }

        // Make events draggable.
        html.draggable({
            appendTo: this._div,
            helper: function(e, ui) {
                var original = $(e.target).closest(".ui-draggable");
                return $(this).clone().css({width: original.width()});
            },
            revert: "invalid",
            cursor: "move",
            containment: this._div.find('.calendar'),
            revert: 'invalid',
            revertDuration: 100,
            start: function (e, ui) {
                $(this).hide();
            },
            stop: function (event, ui) {
                $(this).show();
            }
        });

        // Render the event content.
        html.append(settings.event_renderer(html, event_data));
        return html;
    };

    this.add_event = function(date, event_data) {
        date = isodate(date);
        var events = that._div.find('*[data-date="' + date + '"] .events');
        events.append(that._calendar_event(event_data, date));
    };

    this.remove_event = function(event_data) {
        that._div.find('.event').filter(function() {
            return event_data == $(this).data('event');
        }).remove();
    };

    this._calendar_day = function(date) {
        var html = $('\
            <td class="day">\
                <div class="wrapper">\
                    <div class="day_number"></div>\
                    <div class="events"></div>\
                    <div class="footnote"></div>\
                </div>\
            </td>');
        html.droppable({
            accept: function(d) {
                return d.closest('.event').length > 0 && !d.closest('.day').is(this);
            },
            drop: function(e, ui) {
                var event_data = ui.draggable.data('event');
                ui.draggable.remove();
                settings.on_move_event(event_data, $(this).data('date'));
                $(this).find('.events').append(that._calendar_event(event_data, date));
            }
        });

        var year = date.getFullYear();
        var date_str = year + '-' + (date.getMonth()+1) + '-' + date.getDate();
        html.attr('data-date', date_str);
        html.find(".day_number").append(date.getDate());

        today = new Date();
        if (date.toDateString() == today.toDateString())
            html.addClass("today");

        return html;
    };

    this._calendar_week = function(range_start, range_end, date) {
        var html = $('<tr class="week"></tr>');

        var last = new Date(date);
        last.setDate(date.getDate() + 6);

        while(date <= last){
            var day = this._calendar_day(date);
            if (date < range_start || date > range_end)
                day.addClass("filler");
            html.append(day);
            var newDate = date.setDate(date.getDate() + 1);
            date = new Date(newDate);
        }

        return html;
    };

    this.set_range = function(start, last) {
        // Defines the days that the user wants to see. The actual visible
        // range may differ: This range may later be expanded to begin at the
        // a Sunday, for example.
        var today = new Date();
        if (typeof start !== "undefined")
            settings.start = start;
        else if (settings.period == "month")
            settings.start = new Date(today.getFullYear(), today.getMonth(), 1);
        else
            settings.start = new Date(today.getFullYear(),
                                      today.getMonth(),
                                      today.getDate() - today.getDay());
        if (typeof last !== "undefined" && last >= settings.start) {
            settings.last = last;
            return;
        }
        if (settings.period == "month")
            settings.last = new Date(settings.start.getFullYear(),
                                     settings.start.getMonth() + 1,
                                     0);
        else {
            settings.last = new Date(settings.start.getFullYear(),
                                     settings.start.getMonth(),
                                     settings.start.getDate() + settings.period - 1);
        }
    };

    this._get_visible_range = function() {
        var thestart = new Date(settings.start.getFullYear(),
                                settings.start.getMonth(),
                                settings.start.getDate());
        var thelast = new Date(settings.last.getFullYear(),
                               settings.last.getMonth(),
                               settings.last.getDate());
        // Visible range always starts on a Sunday.
        thestart.setDate(thestart.getDate() - thestart.getDay());
        thelast.setDate(thelast.getDate() + 6 - thelast.getDay());
        return {start: thestart, last: thelast};
    };

    this.href = function(href) {
        if (!href)
            return settings.period + '/' + isodate(settings.start);
        href = href.split('/');
        var period = href[0];
        if (period == "month")
            settings.period = period;
        else
            settings.period = parseInt(period);
        if (href.length > 1)
            var start = from_isodate(href[1]);
        that.set_range(start);
        this._init();
    };

    this.refresh = function() {
        var range = that._get_visible_range();
        settings.on_refresh(that);
        settings.event_api(range.start, range.last, function(data) {
            $.each(data, function(index, day_data) {
                var date = day_data.date.replace(/-0/g, '-');
                var day_div = that._div.find('.day[data-date="' + date + '"]');
                var events = day_div.find('.events');
                events.empty();
                $.each(day_data.events, function(index, ev) {
                    events.append(that._calendar_event(ev, date));
                });
                var footnote = settings.footnote_renderer(day_data.footnote);
                day_div.find(".footnote").text(footnote);
            });
        });
    };

    this._init = function() {
        that._div.empty();
        that._div.append('\
            <div id="navbar">\
                <h2 id="month"></h2>\
                <input id="previous" type="button" value="&lt;"/>\
                <input id="current" type="button" value="&bull;"/>\
                <input id="next" type="button" value="&gt;"/>\
            </div>\
            <table>\
                <tr>\
                </tr>\
            </table>');
        var table = this._div.find('table');
        $.each(weekdays_short, function(i, val) {
            table.find("tr").append("<th>" + val + "</th>");
        });

        // Expand the range to start Sunday, end Saturday.
        var visible = that._get_visible_range();

        // Update navbar text.
        var month_name = months[settings.start.getMonth()];
        var year = settings.start.getFullYear();
        this._div.find("#month").text(month_name + " " + year);

        // Update the user interface.
        var current_date = new Date(visible.start);
        while(current_date <= visible.last) {
            var week = this._calendar_week(settings.start,
                                           settings.last,
                                           current_date);
            table.append(week);
            var newDate = current_date.setDate(current_date.getDate() + 6);
            current_date = new Date(newDate);
        }

        // Trigger event refresh.
        that.refresh();

        // Connect navbar button events.
        this._div.find("#previous").click(this.previous);
        this._div.find("#current").click(this.to_today);
        this._div.find("#next").click(this.next);

        if (settings.event_popup) {
            table.find(".day").qtip($.extend(true, qtip_settings, {
                events: {
                    visible: function() {
                        $(this).find('input:first').focus();
                    }
                },
                content: {
                    text: function(event, api) {
                        var date = from_isodate($(api.elements.target).attr('data-date'));
                        settings.event_popup.update({date: date}, true);
                        return settings.event_popup._div;
                    }
                }
            }));
            table.find('.day').mousedown(function() {
                table.find('.day').removeClass('active');
                $(this).addClass('active');
            });
        }

        this._div.children().bind('wheel mousewheel DOMMouseScroll', function (event) {
            if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0)
                that.next();
            else
                that.previous();
        });
    };

    this.get_active_date = function() {
        return that._div.find('.day.active').data('date');
    };

    this.previous = function() {
        if (settings.period == 'month')
            var start = new Date(settings.start.getFullYear(),
                                 settings.start.getMonth()-1, 1);
        else
            var start = new Date(settings.start.getFullYear(),
                                 settings.start.getMonth(),
                                 settings.start.getDate() - settings.period);
        that.set_range(start, undefined);
        that._init();
    };

    this.to_today = function() {
        that.set_range(undefined, undefined);
        that._init();
    };

    this.next = function() {
        if (settings.period == 'month')
            var start = new Date(settings.start.getFullYear(),
                                 settings.start.getMonth()+1, 1);
        else
            var start = new Date(settings.start.getFullYear(),
                                 settings.start.getMonth(),
                                 settings.start.getDate() + settings.period);
        that.set_range(start, undefined);
        that._init();
    };

    this.set_range(settings.start, settings.last);
    this._init();
};

// ======================================================================
// Popup for adding a new event / editing a single event of a series.
// ======================================================================
var SpiffCalendarPopup = function(options) {
    this._div = undefined;
    var that = this;
    var settings = $.extend(true, {
        event_dialog: undefined,
        render_extra_content: function() {},
        serialize_extra_content: function() {},
        deserialize_extra_content: function() {},
        on_save_before: function(popup) {
            if (!validate_all(popup._div.find('input')))
                return false;
        },
        on_save: function(popup, data) {},
        on_edit_before: function(popup) {},
        on_edit: function(popup, data) {
            settings.event_dialog.show(data);
        },
        on_delete_before: function(event_data) {},
        on_delete: function(popup, data) {},
    }, options);

    this.update = function(event_data, is_new_event) {
        that._div = $('\
                <div id="content" style="display: none">\
                    <div class="general">\
                        <input class="general-name" type="text" placeholder="Event"/>\
                        <input class="general-date" type="text" placeholder="Date"/>\
                    </div>\
                    <div id="extra-content"></div>\
                    <div id="popup-buttons">\
                        <button id="button-delete">Delete</button>\
                        <button id="button-edit">Edit Series...</button>\
                        <button id="button-save">Save</button>\
                    </div>\
                </div>');
        that._div.find('.general-date').datepicker({
            onSelect: function() {
                this.blur();
                $(this).change();
            }
        });

        // If no event_data was passed, assume we are adding a new event.
        if (is_new_event == true) {
            that._div.find('.general-date').hide();
            that._div.find('#button-delete').hide();
        }

        // Define input validators for pre-defined fields.
        that._div.find('input').data('validator', validator_required);

        // Extra content may be provided by the user.
        settings.render_extra_content(that._div.find('#extra-content'),
                                      event_data,
                                      is_new_event);

        // Connect event handlers for input validation.
        var save_btn = this._div.find('#button-save');
        that._div.find('input').keydown(function(e) {
            $(this).removeClass('error');
            if (e.keyCode === 13)
                save_btn.click();
        });
        that._div.find('input').bind('keyup change select', function(e) {
            var nothidden = that._div.find("input:not([style$='display: none;'])");
            var invalid = get_invalid_fields(nothidden);
            save_btn.prop("disabled", invalid.length != 0);
        });

        // Connect button event handlers.
        save_btn.click(function() {
            if (settings.on_save_before(that) == false)
                return;
            that._serialize(event_data, true);
            settings.on_save(that, event_data);
            that._div.closest('.qtip').hide();
        });
        that._div.find('#button-edit').click(function() {
            if (settings.on_edit_before(that) == false)
                return;
            that._serialize(event_data, false);
            settings.on_edit(that, event_data);
            that._div.closest('.qtip').hide();
        });
        that._div.find('#button-delete').click(function() {
            if (settings.on_save_before(that) == false)
                return;
            that._serialize(event_data, false);
            settings.on_delete(that, event_data);
            that._div.closest('.qtip').hide();
        });

        // Add data to the UI.
        that._div.find('.general-name').val(event_data.name);
        that._div.find('.general-date').datepicker("setDate",
                from_isodate(event_data.date));

        // If the user provided settings.render_extra_content, he may
        // also want to populate it with data.
        var extra = that._div.find('#extra-content');
        settings.deserialize_extra_content(extra, event_data);

        // Trigger validation.
        that._div.find('input').keyup();
    };

    this._serialize = function(event_data, include_date) {
        var date = that._div.find('.general-date').datepicker('getDate');
        if (!event_data)
            event_data = {};
        if (include_date == true)
            event_data.date = date;
        event_data.name = that._div.find('.general-name').val();

        // If the user provided settings.render_extra_content, he may
        // also want to serialize it.
        var extra = that._div.find('#extra-content');
        settings.serialize_extra_content(extra, event_data);
    };

    this.update({}, true);
};

// ======================================================================
// Dialog for editing event details.
// ======================================================================
var SpiffCalendarEventDialog = function(options) {
    this._div = $('<div class="SpiffCalendarDialog" style="display: none"></div>');
    var that = this;
    var settings = $.extend(true, {
        event_data: {date: new Date()},
        render_extra_content: function() {},
        serialize_extra_content: function() {},
        deserialize_extra_content: function() {},
        on_save: function(event_data) {},
        on_delete: function(event_data) {}
    }, options);

    this._recurring_range = function() {
        var html = $('\
            <div class="recurring-range">\
              <select>\
                  <option value="forever">forever</option>\
                  <option value="until">until</option>\
                  <option value="times">until counting</option>\
              </select>\
              <span id="recurring-range-until">\
                  <input type="text" class="datepicker"/>\
              </span>\
              <span id="recurring-range-times">\
                  <input id="recurring-range-times-field" type="number" min="1" value="1"/>\
                  <label>times.</label>\
              </span>\
            </div>');
        html.find('input.datepicker').datepicker();
        html.find('input.datepicker').data('validator', validator_required);
        html.find('#recurring-range-times-field').data('validator', validator_required);
        html.find('select').change(function() {
            html.find('span').hide();
            html.find('#recurring-range-' + $(this).val()).show();
        });
        html.find('select').change();
        return html;
    };

    this._recurring_never = function() {
        var html = $('\
            <div class="recurring-never" style="display: none">\
            </div>');
        return html;
    };

    this._recurring_day = function() {
        var html = $('\
            <div class="recurring-day" style="display: none">\
              Repeat every\
              <input class="interval" type="number" min="1" value="1"/>\
              day(s),\
            </div>');
        html.find('input.interval').data('validator', validator_required);
        html.append(that._recurring_range());
        return html;
    };

    this._recurring_week = function() {
        var html = $('\
            <div class="recurring-week" style="display: none">\
              Repeat every\
              <input class="interval" type="number" min="1" value="1"/>\
              week(s) on\
              <div id="weekdays"></div>,\
            </div>');
        html.find('input.interval').data('validator', validator_required);

        // Day selector.
        $.each(weekdays, function(i, val) {
            var day_html = $('<label><input type="checkbox" name="day"/></label>');
            day_html.find('input').data('value', Math.pow(2, (i == 0) ? 6 : (i-1)));
            day_html.append(val);
            html.find('#weekdays').append(day_html);
        });
        html.find('input').data('validator-target', html.find('#weekdays'));
        html.find('input').data('validator', function() {
            return html.find('input:checked').length > 0;
        });

        html.append(that._recurring_range());
        return html;
    };

    this._recurring_month = function() {
        var html = $('\
            <div class="recurring-month" style="display: none">\
              Repeat every\
              <input class="interval" type="number" min="1" value="1"/>\
              month(s), on\
              <span id="recurring-month-byday">\
              the\
                  <select id="recurring-month-count">\
                        <option value="1">first</option>\
                        <option value="2">second</option>\
                        <option value="4">third</option>\
                        <option value="8">fourth</option>\
                        <option value="-1">last</option>\
                        <option value="-2">second-last</option>\
                        <option value="-4">third-last</option>\
                        <option value="-8">fourth-last</option>\
                  </select>\
              </span>\
              <select id="recurring-month-weekday">\
                  <option value="0">day</option>\
              </select>\
              <input id="recurring-month-dom" type="number" min="1" max="31"/>,\
            </div>');
        html.find('#recurring-month-dom').hide();
        html.find('input.interval').data('validator', validator_required);

        // Day selector.
        $.each(weekdays, function(i, val) {
            var day_html = $('<option/>');
            day_html.val(Math.pow(2, (i == 0) ? 6 : (i-1)));
            day_html.append(val);
            html.find('#recurring-month-weekday').append(day_html);
        });

        html.find('#recurring-month-weekday').change(function() {
            if ($(this).val() == 0) {
                html.find('#recurring-month-byday').hide();
                html.find('#recurring-month-dom').show();
            }
            else {
                html.find('#recurring-month-dom').hide();
                html.find('#recurring-month-byday').show();
            }
        });

        html.append(that._recurring_range());
        return html;
    };

    this._recurring_year = function() {
        var html = $('\
             <div class="recurring-year" style="display: none">\
               Repeat every\
               <input class="interval" type="number" min="1" value="1"/>\
               year(s),\
            </div>');
        html.find('input.interval').data('validator', validator_required);
        html.append(that._recurring_range());
        return html;
    };

    this._get_section_from_freq_type = function(freq_type) {
        if (freq_type === 'ONE_TIME')
            return that._div.find('.recurring-never');
        else if (freq_type === 'DAILY')
            return that._div.find('.recurring-day');
        else if (freq_type === 'WEEKLY')
            return that._div.find('.recurring-week');
        else if (freq_type === 'MONTHLY')
            return that._div.find('.recurring-month');
        else if (freq_type === 'ANNUALLY')
            return that._div.find('.recurring-year');
        console.error('invalid freq_type', freq_type);
    };

    this._period_changed = function() {
        var input = $(this);
        that._div.find('#recurring-period button').removeClass('active');
        input.addClass('active');
        var freq_type = input.val();
        that._div.find('#recurring-detail>div').hide();
        var section = that._get_section_from_freq_type(freq_type);
        section.show();
    };

    this._init = function() {
        that._div.append('\
                <div class="general">\
                    <input id="general-name" type="text" placeholder="Name"/>\
                    <input id="general-date" type="text" placeholder="Date"/>\
                </div>\
                <div id="extra-content"></div>\
                <div id="recurring-period" class="radio-bar">\
                </div>\
                <div id="recurring-detail">\
                </div>\
                <div id="buttons">\
                    <button id="button-delete">Delete</button>\
                    <button id="button-save">Save</button>\
                </div>');
        that._div.find('#error').hide();
        that._div.find('#general-name').data('validator', validator_required);
        that._div.find('#general-date').datepicker();
        that._div.find('#general-date').data('validator', validator_required);

        // Period selector.
        $.each(periods, function(index, item) {
            var button = $('<button name="period"></button>');
            button.val(item);
            button.append(period_names[index]);
            button.click(that._period_changed);
            that._div.find('#recurring-period').append(button);
        });

        /*/ Month selector.
        $.each(months, function(i, val) {
            var month_html = $('<label><input type="checkbox" name="month"/></label>');
            month_html.val(i+1);
            month_html.append(val);
        });
    */

        var detail = that._div.find('#recurring-detail');
        detail.append(that._recurring_never());
        detail.append(that._recurring_day());
        detail.append(that._recurring_week());
        detail.append(that._recurring_month());
        detail.append(that._recurring_year());
        detail.find("button:first").click();

        // Extra content may be provided by the user.
        settings.render_extra_content(that._div.find('#extra-content'),
                                      settings.event_data);

        // Validate fields on input.
        var save_btn = that._div.find('#button-save');
        that._div.find('input').keydown(function(e) {
            $(this).removeClass('error');
            if (e.keyCode === 13)
                save_btn.click();
        });
        that._div.find('input').change(function(e) {
            if ($(this).data('validator-target'))
                $(this).data('validator-target').removeClass('error');
            else
                $(this).removeClass('error');
        });
        that._div.find('input,select,button').bind('keyup change select click', function(e) {
            var nothidden = that._div.find("input:visible");
            var invalid = get_invalid_fields(nothidden);
            save_btn.prop("disabled", invalid.length != 0);
        });

        that._div.find('#button-save').click(function(e) {
            var nothidden = that._div.find("input:visible");
            var invalid = get_invalid_field_targets(nothidden);
            if (invalid.length != 0) {
                invalid.addClass('error');
                e.stopPropagation();
                return;
            }
            that._div.dialog('close');
            that._serialize(settings.event_data);
            return settings.on_save(settings.event_data);
        });
        that._div.find('#button-delete').click(function(e) {
            that._div.dialog('close');
            return settings.on_delete(settings.event_data);
        });
    };

    this._serialize = function(event_data) {
        // Serialize general data first.
        event_data.name = that._div.find('#general-name').val();
        event_data.date = that._div.find('#general-date').datepicker('getDate');

        // Serialize recurrence data.
        var selected = that._div.find('#recurring-period button.active');
        var freq_type = selected.val();
        event_data.freq_type = freq_type;

        // Much of the recurrence data depends on the currently selected
        // freq_type.
        var section = that._get_section_from_freq_type(freq_type);
        event_data.freq_interval = section.find('.interval').val();

        // Serialize freq_target.
        if (freq_type === 'WEEKLY') {
            var flags = 0;
            section.find('#weekdays input:checked').each(function() {
                flags |= $(this).data('value');
            });
            event_data.freq_target = flags;
        }
        else if (freq_type === 'MONTHLY')
            event_data.freq_target = section.find('#recurring-month-weekday').val();
        else if (freq_type === 'ANNUALLY')
            event_data.freq_target = 0; //section.find('#recurring-year-doy').val(); <- see docs in _update()
        else
            event_data.freq_target = undefined;

        // Serialize freq_count.
        if (freq_type === 'MONTHLY' && event_data.freq_target == 0)
            event_data.freq_count = section.find('#recurring-month-dom').val();
        else if (freq_type === 'MONTHLY')
            event_data.freq_count = section.find('#recurring-month-count').val();
        else
            event_data.freq_count = undefined;

        // Serialize until_count and until_date.
        var duration = section.find('.recurring-range select').val();
        var until_date = section.find('#recurring-range-until input').datepicker('getDate');
        var until_count = section.find('#recurring-range-times input').val();
        event_data.until_date = undefined;
        event_data.until_count = undefined;
        if (duration === 'until')
            event_data.until_date = until_date;
        else if (duration === 'times')
            event_data.until_count = until_count;

        // Lastly, if the user provided settings.render_extra_content, he may
        // also want to serialize it.
        var extra = that._div.find('#extra-content');
        settings.serialize_extra_content(extra, event_data);
    };

    this._update = function() {
        if (settings.event_data.name)
            that._div.find('#button-delete').show();
        else
            that._div.find('#button-delete').hide();

        // Update general event data.
        this._div.find('#general-name').val(settings.event_data.name);
        var date = from_isodate(settings.event_data.date);
        this._div.find("#general-date").datepicker('setDate', date);

        var freq_type = settings.event_data.freq_type;
        var period_id = periods.indexOf(freq_type);
        if (period_id == -1)
            period_id = 0;
        this._div.find("button")[period_id].click();

        // Update the weekday for weekly events.
        var freq_target = settings.event_data.freq_target;
        if (freq_target == null) {
            var day_num = date.getDay();
            freq_target = Math.pow(2, (day_num == 0) ? 6 : (day_num-1));
        }
        var section = that._get_section_from_freq_type('WEEKLY');
        section.find('#weekdays input').each(function() {
            $(this).prop('checked', (freq_target&$(this).data('value')) != 0);
        });

        // Update the day of month for monthly events.
        var freq_target = settings.event_data.freq_target;
        if (freq_target == null)
            freq_target = 0;
        section = that._get_section_from_freq_type('MONTHLY');
        section.find('#recurring-month-weekday').val(freq_target);
        section.find('#recurring-month-weekday').change();
        section.find('#recurring-month-dom').val(date.getDate());
        var num_days = new Date(date.getFullYear(),
                                date.getMonth() + 1,
                                0).getDate();
        section.find('#recurring-month-dom').prop('max', num_days);

        if (freq_type) {
            var section = that._get_section_from_freq_type(freq_type);

            // Update interval (=nth day/week/month/year)
            section.find('.interval').val(settings.event_data.freq_interval);

            // MONTLY is the only type where freq_count matters. It is a
            // bitmask specifiying the nth freq_target of the month. E.g.
            // 1=first target of the month, 2=second, 4=third
            // -1=last target of the month, -2=second-last, ...
            // 0=every occurence.
            if (freq_type === 'MONTHLY')
                section.find('#recurring-month-count').val(settings.event_data.freq_count);

            //We have no UI yet for specifying annual events with a fixed target
            //day. Hence for annual events, freq_target is always 0, meaning "same
            //calendar day as the initial event".
            //else if (freq_type === 'ANNUALLY')
            //    section.find('#recurring-year-doy').val(settings.event_data.freq_target);

            // Deserialize until_count and until_date.
            var input = section.find('#recurring-range-until input');
            input.datepicker('setDate', from_isodate(settings.event_data.until_date));
            section.find('#recurring-range-times input').val(settings.event_data.until_count);
            var select = section.find('.recurring-range select');
            if (settings.event_data.until_date)
                select.find('option[value="until"]').prop('selected', true);
            else if (settings.event_data.until_count)
                select.find('option[value="times"]').prop('selected', true);
            else
                select.find('option[value="forever"]').prop('selected', true);
            select.change();
        }

        // Lastly, if the user provided settings.render_extra_content, he may
        // also want to populate it with data.
        var extra = that._div.find('#extra-content');
        settings.deserialize_extra_content(extra, settings.event_data);
    };

    this.show = function(event_data) {
        if (event_data)
            settings.event_data = $.extend(true, {}, event_data);
        this._div.show();
        this._update();
        this._div.dialog({
            title: 'Event properties',
            buttons: {
            },
            width: '50em',
            height: 'auto'
        });

        // Trigger validation.
        that._div.find('input').change();
    };

    this.hide = function() {
        this._div.hide();
    };

    this._init();
    this._update();
};
