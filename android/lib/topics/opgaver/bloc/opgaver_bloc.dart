import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/assignment.dart';

enum AssignmentFilters { delivered, awaiting, missing }

extension AssignmentFiltersNames on AssignmentFilters {
  String get name {
    switch (this) {
      case AssignmentFilters.awaiting:
        return "Venter";
      case AssignmentFilters.delivered:
        return "Afleveret";
      case AssignmentFilters.missing:
        return "Mangler";
    }
  }
}

sealed class AssignmentEvent {}

class RequestedLoadAssignments extends AssignmentEvent {}

class ToggleFilter extends AssignmentEvent {
  AssignmentFilters filter;
  ToggleFilter(this.filter);
}

class OpgaveBloc extends Bloc<AssignmentEvent, AssignmentState> {
  final Student student;

  OpgaveBloc(this.student)
      : super(AssignmentState([], null, false, AssignmentFilters.awaiting)) {
    on<RequestedLoadAssignments>((event, emit) async {
      emit(state.copyWith(loaded: false));
      var references = await student.assignments.list();
      emit(state.copyWith(refs: references, loaded: true));
    });

    on<ToggleFilter>(
      (event, emit) {
        emit(state.copyWith(appliedFilter: event.filter));
      },
    );
  }
}

class AssignmentState {
  List<AssignmentRef> refs;
  AssignmentFilters appliedFilter;
  Assignment? activeAssignment;
  bool loaded;
  AssignmentState(
      this.refs, this.activeAssignment, this.loaded, this.appliedFilter);

  AssignmentState copyWith(
      {List<AssignmentRef>? refs,
      Assignment? activeAssignment,
      bool? loaded,
      AssignmentFilters? appliedFilter}) {
    return AssignmentState(
        refs ?? this.refs,
        activeAssignment ?? this.activeAssignment,
        loaded ?? this.loaded,
        appliedFilter ?? this.appliedFilter);
  }
}
