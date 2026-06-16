import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:shared_preferences/shared_preferences.dart';

class HomeworkManagerBloc extends Cubit<List<ManagedHomework>> {
  HomeworkManagerBloc() : super([]) {
    _load();
  }

  _load() async {
    final prefs = await SharedPreferences.getInstance();
    List<ManagedHomework> mHomework = [];
    var homeworkList = prefs.getStringList("homework");
    if (homeworkList != null) {
      for (var homework in homeworkList) {
        mHomework.add(ManagedHomework.fromString(homework));
      }
      emit(mHomework);
    }
  }

  _save() async {
    final prefs = await SharedPreferences.getInstance();
    if (state.isNotEmpty) {
      List<String> data = [];
      for (var homework in state) {
        data.add(homework.toString());
      }
      prefs.setStringList("homework", data);
    }
  }

  toggle(Homework homework) {
    var index = state
        .indexWhere((element) => element.homeworkId == homework.activity.id);
    var copiedState = state.take(state.length).toList();
    if (index == -1) {
      copiedState
          .add(ManagedHomework(DateTime.now(), homework.activity.id, true));
    } else {
      var newVal = !state[index].done;
      copiedState[index].done = newVal;
    }
    emit(copiedState);
    _save();
  }
}

class ManagedHomework {
  DateTime modified;
  String homeworkId;
  bool done;

  factory ManagedHomework.fromString(String content) {
    var keyAndVals = content.split(";");
    DateTime modified = DateTime.now();
    String homeworkId = "";
    bool done = false;
    for (var keyAndVal in keyAndVals) {
      var key = keyAndVal.split("=");
      switch (key[0]) {
        case "modified":
          modified = DateTime.parse(key[1]);
          break;
        case "done":
          done = bool.parse(key[1]);
          break;
        case "id":
          homeworkId = key[1];
          break;
      }
    }
    return ManagedHomework(modified, homeworkId, done);
  }
  @override
  String toString() {
    return "done=$done;modified=${modified.toIso8601String()};id=$homeworkId";
  }

  ManagedHomework(this.modified, this.homeworkId, this.done);
}
